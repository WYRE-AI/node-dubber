import { DubberTokenProvider, defaultTokenCache } from './auth.js';
import { baseUrlForRegion, DEFAULT_REGION, type DubberConfig } from './config.js';
import { parseDubberError } from './errors.js';
import { HttpClient } from './http.js';
import { AccountsResource } from './resources/accounts.js';
import { DubPointsResource } from './resources/dub-points.js';
import { GroupsResource } from './resources/groups.js';
import { NotificationsResource } from './resources/notifications.js';
import { ProfileResource } from './resources/profile.js';
import { RecordingsResource } from './resources/recordings.js';
import { UsersResource } from './resources/users.js';

export interface ConnectionTestResult {
  ok: boolean;
  error?: string;
}

/** Dubber API Store client: one token realm, one HttpClient, shared across resources. */
export class DubberClient {
  readonly groups: GroupsResource;
  readonly accounts: AccountsResource;
  readonly recordings: RecordingsResource;
  readonly users: UsersResource;
  readonly profile: ProfileResource;
  readonly notifications: NotificationsResource;
  readonly dubPoints: DubPointsResource;

  private readonly auth: DubberTokenProvider;
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(config: DubberConfig) {
    for (const key of ['clientId', 'clientSecret', 'authId', 'authToken'] as const) {
      const value = config[key];
      if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`Dubber credential "${key}" is required and must be a non-empty string.`);
      }
    }

    const baseUrl = config.baseUrl ?? baseUrlForRegion(config.region ?? DEFAULT_REGION);
    this.baseUrl = baseUrl;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    const cache = config.tokenCache ?? defaultTokenCache;
    this.auth = new DubberTokenProvider({
      baseUrl,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      authId: config.authId,
      authToken: config.authToken,
      cache,
    });

    const http = new HttpClient({
      baseUrl,
      auth: this.auth,
      ...(config.maxRetries !== undefined ? { maxRetries: config.maxRetries } : {}),
    });

    this.groups = new GroupsResource(http);
    this.accounts = new AccountsResource(http);
    this.recordings = new RecordingsResource(http);
    this.users = new UsersResource(http);
    this.profile = new ProfileResource(http);
    this.notifications = new NotificationsResource(http);
    this.dubPoints = new DubPointsResource(http);
  }

  /** Mint (or read cached) a token; never throws. A successful mint does not prove any specific product access. */
  async testConnection(): Promise<ConnectionTestResult> {
    try {
      await this.auth.getToken();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Revoke the current OAuth token (Dubber's documented `POST /revoke`).
   *
   * The interactive console lists this endpoint under "OAuth 2 Methods" with
   * no further parameter detail. This follows the standard OAuth 2.0 token
   * revocation shape (RFC 7009: the token plus client credentials as a
   * form-encoded POST body) rather than guessing at a Dubber-specific one —
   * verify against a live sandbox call before relying on it in production.
   */
  async revokeToken(): Promise<void> {
    const token = await this.auth.getToken();
    const base = this.baseUrl.replace(/\/+$/, '');
    const response = await fetch(`${base}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token: token.accessToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }).toString(),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const rawText = await response.text();
      let body: unknown = rawText;
      try {
        body = JSON.parse(rawText);
      } catch {
        // keep raw text
      }
      throw parseDubberError(response.status, body, response.headers);
    }
  }
}
