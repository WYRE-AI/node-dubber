import { createHash } from 'node:crypto';

import { parseDubberError, DubberError } from './errors.js';

/** Supplies auth headers for the HttpClient and (optionally) handles 401s. */
export interface AuthProvider {
  headers(): Promise<Record<string, string>>;
  /** Called at most once per request on 401. Return true if refreshed → retry once. */
  handleUnauthorized?(): Promise<boolean>;
}

export interface DubberToken {
  accessToken: string;
  /** Local epoch ms at which the token expires (issue time + `expires_in`). */
  expiresAt: number;
  tokenType?: string;
}

/**
 * Re-mint well before expiry. The getting-started guide documents a 24h
 * token lifetime; a 30-minute margin is conservative without being wasteful.
 */
const EXPIRY_MARGIN_MS = 1_800_000;
const TOKEN_TIMEOUT_MS = 30_000;

/**
 * Process-wide token cache. HTTP-mode MCP servers build a fresh client on
 * every request, so a per-client cache would mint a token per tool call.
 * Bounded: when full, the oldest-inserted entry is evicted.
 */
export class TokenCache {
  private readonly entries = new Map<string, DubberToken>();

  constructor(private readonly maxEntries: number = 500) {}

  get(key: string): DubberToken | undefined {
    return this.entries.get(key);
  }

  set(key: string, token: DubberToken): void {
    this.entries.delete(key); // re-insert as newest
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, token);
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

export const defaultTokenCache = new TokenCache();

/** Concurrent mints for the same key share one request (single-flight), across clients. */
const inFlight = new Map<string, Promise<DubberToken>>();

export interface DubberTokenProviderOptions {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  authId: string;
  authToken: string;
  cache: TokenCache;
}

/**
 * Dubber password-grant token provider.
 *
 * POST {baseUrl}/token, `Content-Type: application/x-www-form-urlencoded`,
 * body `grant_type=password&client_id=...&client_secret=...&username=...&password=...`
 * where `username`/`password` are the Dubber Auth ID/Token, not a human
 * login (source: Dubber API Getting Started Guide). The response carries a
 * `refresh_token`, but Dubber's refresh-grant contract isn't documented
 * anywhere this client could verify, so — matching the fleet's existing
 * KPN client — this simply re-mints via the same password grant on expiry
 * instead of guessing at an unverified refresh flow. A 401 from the token
 * endpoint is terminal (never retried).
 */
export class DubberTokenProvider implements AuthProvider {
  private readonly key: string;

  constructor(private readonly opts: DubberTokenProviderOptions) {
    // Hashing credentials into the key: a rotated secret never reuses a
    // cached token, and no raw secret sits in a map key.
    this.key = createHash('sha256')
      .update(
        [opts.baseUrl, opts.clientId, opts.clientSecret, opts.authId, opts.authToken].join('\n')
      )
      .digest('hex');
  }

  async headers(): Promise<Record<string, string>> {
    const token = await this.getToken();
    return { Authorization: `Bearer ${token.accessToken}` };
  }

  async handleUnauthorized(): Promise<boolean> {
    this.opts.cache.delete(this.key);
    return true;
  }

  /** Cached token when still valid (with a margin), otherwise a fresh mint. */
  async getToken(): Promise<DubberToken> {
    const cached = this.opts.cache.get(this.key);
    if (cached && Date.now() < cached.expiresAt - EXPIRY_MARGIN_MS) return cached;

    let pending = inFlight.get(this.key);
    if (!pending) {
      // Dropped once settled, so a failed mint is retried by the next caller.
      pending = this.mint().finally(() => inFlight.delete(this.key));
      inFlight.set(this.key, pending);
    }
    return pending;
  }

  private async mint(): Promise<DubberToken> {
    const base = this.opts.baseUrl.replace(/\/+$/, '');
    const response = await fetch(`${base}/token`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: this.opts.clientId,
        client_secret: this.opts.clientSecret,
        username: this.opts.authId,
        password: this.opts.authToken,
      }).toString(),
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });

    const rawText = await response.text();
    let body: unknown = rawText;
    try {
      body = JSON.parse(rawText);
    } catch {
      // keep raw text
    }
    if (!response.ok) throw parseDubberError(response.status, body, response.headers);

    const b = (body ?? {}) as Record<string, unknown>;
    if (typeof b['access_token'] !== 'string' || b['access_token'] === '') {
      throw new DubberError('Dubber token endpoint returned no access_token', response.status, body);
    }
    const token: DubberToken = {
      accessToken: b['access_token'],
      expiresAt: Date.now() + (Number(b['expires_in']) || 0) * 1000,
      tokenType: typeof b['token_type'] === 'string' ? b['token_type'] : undefined,
    };
    this.opts.cache.set(this.key, token);
    return token;
  }
}
