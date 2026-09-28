import type { AuthProvider } from './auth.js';
import { AuthenticationError, ServerError, RateLimitError, parseDubberError } from './errors.js';

export interface HttpClientConfig {
  baseUrl: string;
  auth?: AuthProvider;
  /** Max retries for network errors, 429 and 5xx — idempotent requests only (default 3). */
  maxRetries?: number;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  params?: Record<string, string | number | boolean | undefined>;
  /** JSON-encoded. */
  body?: unknown;
  headers?: Record<string, string>;
  /** Safe to retry on network errors / 429 / 5xx? Default: `method === 'GET'`. */
  idempotent?: boolean;
  responseType?: 'json' | 'binary';
}

export interface BinaryResponse {
  data: Uint8Array;
  contentType: string;
  filename?: string;
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const TIMEOUT_MS = 30_000;

function parseFilename(disposition: string | null): string | undefined {
  if (!disposition) return undefined;
  const extended = /filename\*\s*=\s*[^']*''([^;]+)/i.exec(disposition);
  if (extended?.[1]) return decodeURIComponent(extended[1].trim());
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(disposition);
  return plain?.[1]?.trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoff(attempt: number): number {
  return Math.min(1000 * 2 ** (attempt - 1), 30_000);
}

/** Empty → undefined; JSON when it parses; raw text otherwise. */
function parseBody(rawText: string): unknown {
  if (rawText.length === 0) return undefined;
  try {
    return JSON.parse(rawText);
  } catch {
    return rawText;
  }
}

/**
 * Native-fetch HTTP client for the Dubber API.
 *
 * - Retry policy is SAFETY-CRITICAL: network errors, 429 and 500/502/503/504
 *   are retried ONLY when the request is idempotent (default: GET; opt-in
 *   otherwise). Recording deletes, tag writes, notification creation, and
 *   every other mutating call are never retried automatically — a duplicate
 *   POST against a call-recording/compliance API is a real-world side
 *   effect the caller should decide about, not this client. Backoff
 *   `min(1000·2^(n-1), 30s)`; `Retry-After` is honoured.
 * - A 401 triggers the auth provider's refresh and ONE retry, for every
 *   method: the request was rejected, so repeating it is safe. This retry
 *   does not count against `maxRetries`.
 * - Reads every body as text first, then JSON.parse — never `.json()` then
 *   `.text()` ("body already read").
 * - 30s timeout per attempt.
 */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly auth: AuthProvider | undefined;
  private readonly maxRetries: number;

  constructor(config: HttpClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.auth = config.auth;
    this.maxRetries = config.maxRetries ?? 3;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', params, body, responseType = 'json' } = options;
    const idempotent = options.idempotent ?? method === 'GET';
    const maxRetries = idempotent ? this.maxRetries : 0;
    const url = this.buildUrl(path, params);

    let attempt = 0;
    let attemptedAuthRefresh = false;
    for (;;) {
      const headers: Record<string, string> = {
        Accept: responseType === 'binary' ? '*/*' : 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
        ...(this.auth ? await this.auth.headers() : {}),
      };

      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (err) {
        if (attempt >= maxRetries) throw err;
        attempt += 1;
        await sleep(backoff(attempt));
        continue;
      }

      if (response.ok) {
        if (responseType === 'binary') {
          return {
            data: new Uint8Array(await response.arrayBuffer()),
            contentType: response.headers.get('content-type') ?? 'application/octet-stream',
            filename: parseFilename(response.headers.get('content-disposition')),
          } as T;
        }
        return parseBody(await response.text()) as T;
      }

      const error = parseDubberError(response.status, parseBody(await response.text()), response.headers);

      if (error instanceof AuthenticationError && !attemptedAuthRefresh && this.auth?.handleUnauthorized) {
        attemptedAuthRefresh = true;
        if (await this.auth.handleUnauthorized().catch(() => false)) continue;
      }

      const retryable =
        RETRYABLE_STATUSES.has(response.status) &&
        (error instanceof RateLimitError || error instanceof ServerError);
      if (!retryable || attempt >= maxRetries) throw error;
      attempt += 1;
      const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
      await sleep(Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 30_000) : backoff(attempt));
    }
  }

  /** Strip trailing slashes; undefined param values are dropped. */
  private buildUrl(path: string, params: RequestOptions['params']): string {
    let normalizedPath = path.startsWith('/') ? path : `/${path}`;
    if (normalizedPath.length > 1) normalizedPath = normalizedPath.replace(/\/+$/, '');
    let url = `${this.baseUrl}${normalizedPath}`;

    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined) continue;
        searchParams.append(key, String(value));
      }
      const qs = searchParams.toString();
      if (qs) url += `${url.includes('?') ? '&' : '?'}${qs}`;
    }
    return url;
  }
}
