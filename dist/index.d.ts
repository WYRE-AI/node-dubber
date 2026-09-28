/** Supplies auth headers for the HttpClient and (optionally) handles 401s. */
interface AuthProvider {
    headers(): Promise<Record<string, string>>;
    /** Called at most once per request on 401. Return true if refreshed → retry once. */
    handleUnauthorized?(): Promise<boolean>;
}
interface DubberToken {
    accessToken: string;
    /** Local epoch ms at which the token expires (issue time + `expires_in`). */
    expiresAt: number;
    tokenType?: string;
}
/**
 * Process-wide token cache. HTTP-mode MCP servers build a fresh client on
 * every request, so a per-client cache would mint a token per tool call.
 * Bounded: when full, the oldest-inserted entry is evicted.
 */
declare class TokenCache {
    private readonly maxEntries;
    private readonly entries;
    constructor(maxEntries?: number);
    get(key: string): DubberToken | undefined;
    set(key: string, token: DubberToken): void;
    delete(key: string): void;
    clear(): void;
    get size(): number;
}
declare const defaultTokenCache: TokenCache;
interface DubberTokenProviderOptions {
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
declare class DubberTokenProvider implements AuthProvider {
    private readonly opts;
    private readonly key;
    constructor(opts: DubberTokenProviderOptions);
    headers(): Promise<Record<string, string>>;
    handleUnauthorized(): Promise<boolean>;
    /** Cached token when still valid (with a margin), otherwise a fresh mint. */
    getToken(): Promise<DubberToken>;
    private mint;
}

/**
 * All Dubber API Store products sit behind one Mashery-proxied host,
 * `api.dubber.net`, with an environment segment in the path:
 * `https://api.dubber.net/<region>/v1`. `sandbox` is the free-signup
 * environment (developer.kpn.com-style self-serve); production is
 * region-scoped (confirmed regions: `sandbox`, `us`; the getting-started
 * guide also references an "Australian production environment" without
 * giving its exact segment — verify with Dubber support before assuming
 * `au`). There is deliberately no single production default: shipping
 * against the wrong region silently talks to the wrong tenant's data.
 */
declare const DEFAULT_REGION = "sandbox";
declare const API_HOST = "https://api.dubber.net";
declare function baseUrlForRegion(region: string): string;
/**
 * Password-grant token endpoint, relative to the region base URL (source:
 * Dubber API Getting Started Guide, support.dubber.net). `client_id` /
 * `client_secret` are the Mashery application key/secret issued at
 * developer.kpn.com-style signup on developer.dubber.net; `username` /
 * `password` are NOT a human login — they are the separate "Dubber Auth ID"
 * / "Dubber Auth Token" pair from the Dubber portal's API tab. All four are
 * required; there is no documented client_credentials grant despite the
 * interactive console listing one as an option.
 */
declare const TOKEN_PATH = "/token";
interface DubberConfig {
    /** Mashery application key. */
    clientId: string;
    /** Mashery application secret. */
    clientSecret: string;
    /** Dubber Auth ID (Dubber portal → API tab). Sent as the OAuth `username`. */
    authId: string;
    /** Dubber Auth Token (Dubber portal → API tab). Sent as the OAuth `password`. */
    authToken: string;
    /** Default {@link DEFAULT_REGION} (`sandbox`). Ignored if `baseUrl` is set. */
    region?: string;
    /** Full base URL override. Env mode only — never accept this from a gateway header. */
    baseUrl?: string;
    /** Max retries for network errors, 429s and 5xx — idempotent requests only (default 3). */
    maxRetries?: number;
    /** Token cache override (tests pass a fresh one). Default: the process-wide `defaultTokenCache`. */
    tokenCache?: TokenCache;
}

interface HttpClientConfig {
    baseUrl: string;
    auth?: AuthProvider;
    /** Max retries for network errors, 429 and 5xx — idempotent requests only (default 3). */
    maxRetries?: number;
}
interface RequestOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    params?: Record<string, string | number | boolean | undefined>;
    /** JSON-encoded. */
    body?: unknown;
    headers?: Record<string, string>;
    /** Safe to retry on network errors / 429 / 5xx? Default: `method === 'GET'`. */
    idempotent?: boolean;
    responseType?: 'json' | 'binary';
}
interface BinaryResponse {
    data: Uint8Array;
    contentType: string;
    filename?: string;
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
declare class HttpClient {
    private readonly baseUrl;
    private readonly auth;
    private readonly maxRetries;
    constructor(config: HttpClientConfig);
    request<T>(path: string, options?: RequestOptions): Promise<T>;
    /** Strip trailing slashes; undefined param values are dropped. */
    private buildUrl;
}

/**
 * Entity shapes for the Dubber API. Dubber does not publish a downloadable
 * OpenAPI/JSON-Schema spec (the interactive `/io-docs` console gives request
 * examples, not response schemas), so every interface here types the fields
 * that were actually visible in the console's examples/field lists and
 * leaves everything else open via `[key: string]: unknown` rather than
 * asserting a shape this client can't verify. Treat these as a floor, not a
 * ceiling — widen them from real responses as the fleet exercises this SDK
 * against a live sandbox account.
 */
interface Group {
    id: string;
    name: string;
    parent_group_id?: string;
    [key: string]: unknown;
}
interface Account {
    id: string;
    name: string;
    group_id?: string;
    timezone?: string;
    [key: string]: unknown;
}
interface Recording {
    id: string;
    account_id?: string;
    duration?: number;
    created_at?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
}
interface Waveform {
    recording_id?: string;
    [key: string]: unknown;
}
interface UploadTarget {
    recording_id?: string;
    upload_url?: string;
    [key: string]: unknown;
}
interface DubberUser {
    id: string;
    email?: string;
    name?: string;
    role?: string;
    account_id?: string;
    [key: string]: unknown;
}
interface Profile {
    id?: string;
    email?: string;
    name?: string;
    [key: string]: unknown;
}
interface Notification {
    id: string;
    url?: string;
    event?: string;
    active?: boolean;
    [key: string]: unknown;
}
interface DubPoint {
    id: string;
    name?: string;
    account_id?: string;
    [key: string]: unknown;
}
/** Some Dubber list endpoints may wrap results (`{data: [...]}` / `{items: [...]}`); others return a bare array. */
declare function unwrapList<T>(body: unknown, ...wrapperKeys: string[]): T[];

/** Dubber accounts — created under a group, hold recordings and users. */
declare class AccountsResource {
    private readonly http;
    constructor(http: HttpClient);
    /** The Group Methods docs list account creation as `POST /accounts` (unscoped by group in the path). */
    create(data: {
        name: string;
        group_id?: string;
        timezone?: string;
        [key: string]: unknown;
    }): Promise<Account>;
    get(accountId: string): Promise<Account>;
    update(accountId: string, data: Record<string, unknown>): Promise<Account>;
}

/** Dub.Point: connects an external telecom system (e.g. BroadWorks) to Dubber recording. */
declare class DubPointsResource {
    private readonly http;
    constructor(http: HttpClient);
    list(accountId: string): Promise<DubPoint[]>;
    create(accountId: string, data: Record<string, unknown>): Promise<DubPoint>;
    get(dubPointId: string): Promise<DubPoint>;
    /** Look up a Dub.Point by external-system identifiers (e.g. a BroadWorks user id). */
    find(params: Record<string, string>): Promise<DubPoint[]>;
}

/** Group hierarchy and group-scoped unidentified (unclaimed) recordings. */
declare class GroupsResource {
    private readonly http;
    constructor(http: HttpClient);
    get(groupId: string): Promise<Group>;
    createChild(groupId: string, data: {
        name: string;
        [key: string]: unknown;
    }): Promise<Group>;
    listUnidentifiedRecordings(groupId: string): Promise<Recording[]>;
    createUnidentifiedRecording(groupId: string, data: Record<string, unknown>): Promise<Recording>;
}

/** REST-hook (webhook) subscriptions, account-scoped. */
declare class NotificationsResource {
    private readonly http;
    constructor(http: HttpClient);
    list(accountId: string): Promise<Notification[]>;
    create(accountId: string, data: {
        url: string;
        event: string;
        [key: string]: unknown;
    }): Promise<Notification>;
    get(notificationId: string): Promise<Notification>;
    update(notificationId: string, data: Record<string, unknown>): Promise<Notification>;
    /** A newly created rest hook needs an explicit activation step before it fires. */
    activate(notificationId: string): Promise<Notification>;
    /** Unclaimed/undelivered notification events pending for this subscription. */
    listUnclaimed(notificationId: string): Promise<unknown[]>;
    delete(notificationId: string): Promise<void>;
}

declare class ProfileResource {
    private readonly http;
    constructor(http: HttpClient);
    /** The authenticated user/application's own profile. */
    get(): Promise<Profile>;
}

/**
 * Call recordings: single-shot upload, retrieval, metadata/tags, waveform,
 * and the multipart large-file variant (initiate → get upload target →
 * complete).
 */
declare class RecordingsResource {
    private readonly http;
    constructor(http: HttpClient);
    list(accountId: string, params?: {
        limit?: number;
        offset?: number;
    }): Promise<Recording[]>;
    /** Single-shot recording upload/creation. */
    create(accountId: string, data: Record<string, unknown>): Promise<Recording>;
    get(recordingId: string): Promise<Recording>;
    getWaveform(recordingId: string): Promise<Waveform>;
    /** Fetch the recorded audio itself as binary (content-type/filename from response headers). */
    download(recordingId: string): Promise<BinaryResponse>;
    delete(recordingId: string): Promise<void>;
    updateMetadata(recordingId: string, metadata: Record<string, unknown>): Promise<Recording>;
    addTags(recordingId: string, tags: string[]): Promise<Recording>;
    deleteTags(recordingId: string, tags: string[]): Promise<Recording>;
    /** Multipart upload, step 1: initiate. Same endpoint as {@link create}; the account_id path distinguishes it. */
    initiateMultipart(accountId: string, data: Record<string, unknown>): Promise<Recording>;
    /** Multipart upload, step 2: get the target/part URL to PUT audio bytes to. */
    getUploadTarget(recordingId: string): Promise<UploadTarget>;
    /** Multipart upload, step 3: mark the upload complete once all parts are sent. */
    completeUpload(recordingId: string, data?: Record<string, unknown>): Promise<Recording>;
}

declare class UsersResource {
    private readonly http;
    constructor(http: HttpClient);
    list(accountId: string): Promise<DubberUser[]>;
    create(accountId: string, data: {
        email: string;
        name?: string;
        [key: string]: unknown;
    }): Promise<DubberUser>;
    get(userId: string): Promise<DubberUser>;
    update(userId: string, data: Record<string, unknown>): Promise<DubberUser>;
    delete(userId: string): Promise<void>;
}

interface ConnectionTestResult {
    ok: boolean;
    error?: string;
}
/** Dubber API Store client: one token realm, one HttpClient, shared across resources. */
declare class DubberClient {
    readonly groups: GroupsResource;
    readonly accounts: AccountsResource;
    readonly recordings: RecordingsResource;
    readonly users: UsersResource;
    readonly profile: ProfileResource;
    readonly notifications: NotificationsResource;
    readonly dubPoints: DubPointsResource;
    private readonly auth;
    private readonly baseUrl;
    private readonly clientId;
    private readonly clientSecret;
    constructor(config: DubberConfig);
    /** Mint (or read cached) a token; never throws. A successful mint does not prove any specific product access. */
    testConnection(): Promise<ConnectionTestResult>;
    /**
     * Revoke the current OAuth token (Dubber's documented `POST /revoke`).
     *
     * The interactive console lists this endpoint under "OAuth 2 Methods" with
     * no further parameter detail. This follows the standard OAuth 2.0 token
     * revocation shape (RFC 7009: the token plus client credentials as a
     * form-encoded POST body) rather than guessing at a Dubber-specific one —
     * verify against a live sandbox call before relying on it in production.
     */
    revokeToken(): Promise<void>;
}

/**
 * Base error: HTTP status and the raw response body. Dubber's error envelope
 * shape is not published in the getting-started guide or the interactive
 * console's static markup (only request/response *examples* for successful
 * calls were available while building this client) — `parseDubberError`
 * below is deliberately conservative: it tries a handful of common REST
 * error shapes (`{message}`, `{error}`, `{error_description}`, plain text)
 * and always falls back to the raw body, rather than asserting a specific
 * envelope it can't verify.
 */
declare class DubberError extends Error {
    statusCode: number;
    response: unknown;
    constructor(message: string, statusCode: number, response: unknown);
}
/** 401, or a token-endpoint rejection. */
declare class AuthenticationError extends DubberError {
}
/** 403. */
declare class ForbiddenError extends DubberError {
}
declare class NotFoundError extends DubberError {
}
/** 400 / 422. */
declare class ValidationError extends DubberError {
}
declare class ConflictError extends DubberError {
}
/**
 * 429. The getting-started guide documents "500 calls for a token in a
 * 24-hour period" but no `Retry-After` convention — `retryAfter` defaults to
 * 5s and is overridden only if the response actually sends the header.
 */
declare class RateLimitError extends DubberError {
    retryAfter: number;
}
/** 5xx. */
declare class ServerError extends DubberError {
}
/** Map a non-2xx Dubber response to the matching {@link DubberError} subclass. */
declare function parseDubberError(status: number, body: unknown, headers?: Headers): DubberError;

export { API_HOST, type Account, AccountsResource, type AuthProvider, AuthenticationError, type BinaryResponse, ConflictError, type ConnectionTestResult, DEFAULT_REGION, type DubPoint, DubPointsResource, DubberClient, type DubberConfig, DubberError, type DubberToken, DubberTokenProvider, type DubberTokenProviderOptions, type DubberUser, ForbiddenError, type Group, GroupsResource, HttpClient, type HttpClientConfig, NotFoundError, type Notification, NotificationsResource, type Profile, ProfileResource, RateLimitError, type Recording, RecordingsResource, type RequestOptions, ServerError, TOKEN_PATH, TokenCache, type UploadTarget, UsersResource, ValidationError, type Waveform, baseUrlForRegion, defaultTokenCache, parseDubberError, unwrapList };
