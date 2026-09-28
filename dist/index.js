// src/auth.ts
import { createHash } from "crypto";

// src/errors.ts
var DubberError = class extends Error {
  constructor(message, statusCode, response) {
    super(message);
    this.statusCode = statusCode;
    this.response = response;
    Object.setPrototypeOf(this, new.target.prototype);
  }
  statusCode;
  response;
};
var AuthenticationError = class extends DubberError {
};
var ForbiddenError = class extends DubberError {
};
var NotFoundError = class extends DubberError {
};
var ValidationError = class extends DubberError {
};
var ConflictError = class extends DubberError {
};
var RateLimitError = class extends DubberError {
  retryAfter = 5;
};
var ServerError = class extends DubberError {
};
function str(value) {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number") return String(value);
  return void 0;
}
function extractMessage(body) {
  if (typeof body === "string") return body.trim() || void 0;
  if (body === null || typeof body !== "object") return void 0;
  const b = body;
  return str(b["message"]) ?? str(b["error_description"]) ?? str(b["error"]?.["message"]) ?? str(b["error"]) ?? str(b["Error"]);
}
function parseDubberError(status, body, headers) {
  const message = extractMessage(body);
  switch (status) {
    case 400:
    case 422:
      return new ValidationError(message ?? "Bad request", status, body);
    case 401:
      return new AuthenticationError(message ?? "Authentication failed", status, body);
    case 403:
      return new ForbiddenError(message ?? "Forbidden", status, body);
    case 404:
      return new NotFoundError(message ?? "Resource not found", status, body);
    case 409:
      return new ConflictError(message ?? "Conflict", status, body);
    case 429: {
      const error = new RateLimitError(message ?? "Rate limit exceeded", status, body);
      const retryAfter = Number.parseInt(headers?.get("retry-after") ?? "", 10);
      if (Number.isFinite(retryAfter)) error.retryAfter = retryAfter;
      return error;
    }
  }
  if (status >= 500) return new ServerError(message ?? `Server error: ${status}`, status, body);
  return new DubberError(message ?? `HTTP ${status}`, status, body);
}

// src/auth.ts
var EXPIRY_MARGIN_MS = 18e5;
var TOKEN_TIMEOUT_MS = 3e4;
var TokenCache = class {
  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
  }
  maxEntries;
  entries = /* @__PURE__ */ new Map();
  get(key) {
    return this.entries.get(key);
  }
  set(key, token) {
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== void 0) this.entries.delete(oldest);
    }
    this.entries.set(key, token);
  }
  delete(key) {
    this.entries.delete(key);
  }
  clear() {
    this.entries.clear();
  }
  get size() {
    return this.entries.size;
  }
};
var defaultTokenCache = new TokenCache();
var inFlight = /* @__PURE__ */ new Map();
var DubberTokenProvider = class {
  constructor(opts) {
    this.opts = opts;
    this.key = createHash("sha256").update(
      [opts.baseUrl, opts.clientId, opts.clientSecret, opts.authId, opts.authToken].join("\n")
    ).digest("hex");
  }
  opts;
  key;
  async headers() {
    const token = await this.getToken();
    return { Authorization: `Bearer ${token.accessToken}` };
  }
  async handleUnauthorized() {
    this.opts.cache.delete(this.key);
    return true;
  }
  /** Cached token when still valid (with a margin), otherwise a fresh mint. */
  async getToken() {
    const cached = this.opts.cache.get(this.key);
    if (cached && Date.now() < cached.expiresAt - EXPIRY_MARGIN_MS) return cached;
    let pending = inFlight.get(this.key);
    if (!pending) {
      pending = this.mint().finally(() => inFlight.delete(this.key));
      inFlight.set(this.key, pending);
    }
    return pending;
  }
  async mint() {
    const base = this.opts.baseUrl.replace(/\/+$/, "");
    const response = await fetch(`${base}/token`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: this.opts.clientId,
        client_secret: this.opts.clientSecret,
        username: this.opts.authId,
        password: this.opts.authToken
      }).toString(),
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS)
    });
    const rawText = await response.text();
    let body = rawText;
    try {
      body = JSON.parse(rawText);
    } catch {
    }
    if (!response.ok) throw parseDubberError(response.status, body, response.headers);
    const b = body ?? {};
    if (typeof b["access_token"] !== "string" || b["access_token"] === "") {
      throw new DubberError("Dubber token endpoint returned no access_token", response.status, body);
    }
    const token = {
      accessToken: b["access_token"],
      expiresAt: Date.now() + (Number(b["expires_in"]) || 0) * 1e3,
      tokenType: typeof b["token_type"] === "string" ? b["token_type"] : void 0
    };
    this.opts.cache.set(this.key, token);
    return token;
  }
};

// src/config.ts
var DEFAULT_REGION = "sandbox";
var API_HOST = "https://api.dubber.net";
function baseUrlForRegion(region) {
  const clean = region.trim().replace(/^\/+|\/+$/g, "");
  return `${API_HOST}/${clean}/v1`;
}
var TOKEN_PATH = "/token";

// src/http.ts
var RETRYABLE_STATUSES = /* @__PURE__ */ new Set([429, 500, 502, 503, 504]);
var TIMEOUT_MS = 3e4;
function parseFilename(disposition) {
  if (!disposition) return void 0;
  const extended = /filename\*\s*=\s*[^']*''([^;]+)/i.exec(disposition);
  if (extended?.[1]) return decodeURIComponent(extended[1].trim());
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(disposition);
  return plain?.[1]?.trim();
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function backoff(attempt) {
  return Math.min(1e3 * 2 ** (attempt - 1), 3e4);
}
function parseBody(rawText) {
  if (rawText.length === 0) return void 0;
  try {
    return JSON.parse(rawText);
  } catch {
    return rawText;
  }
}
var HttpClient = class {
  baseUrl;
  auth;
  maxRetries;
  constructor(config) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.auth = config.auth;
    this.maxRetries = config.maxRetries ?? 3;
  }
  async request(path, options = {}) {
    const { method = "GET", params, body, responseType = "json" } = options;
    const idempotent = options.idempotent ?? method === "GET";
    const maxRetries = idempotent ? this.maxRetries : 0;
    const url = this.buildUrl(path, params);
    let attempt = 0;
    let attemptedAuthRefresh = false;
    for (; ; ) {
      const headers = {
        Accept: responseType === "binary" ? "*/*" : "application/json",
        ...body !== void 0 ? { "Content-Type": "application/json" } : {},
        ...options.headers,
        ...this.auth ? await this.auth.headers() : {}
      };
      let response;
      try {
        response = await fetch(url, {
          method,
          headers,
          body: body !== void 0 ? JSON.stringify(body) : void 0,
          signal: AbortSignal.timeout(TIMEOUT_MS)
        });
      } catch (err) {
        if (attempt >= maxRetries) throw err;
        attempt += 1;
        await sleep(backoff(attempt));
        continue;
      }
      if (response.ok) {
        if (responseType === "binary") {
          return {
            data: new Uint8Array(await response.arrayBuffer()),
            contentType: response.headers.get("content-type") ?? "application/octet-stream",
            filename: parseFilename(response.headers.get("content-disposition"))
          };
        }
        return parseBody(await response.text());
      }
      const error = parseDubberError(response.status, parseBody(await response.text()), response.headers);
      if (error instanceof AuthenticationError && !attemptedAuthRefresh && this.auth?.handleUnauthorized) {
        attemptedAuthRefresh = true;
        if (await this.auth.handleUnauthorized().catch(() => false)) continue;
      }
      const retryable = RETRYABLE_STATUSES.has(response.status) && (error instanceof RateLimitError || error instanceof ServerError);
      if (!retryable || attempt >= maxRetries) throw error;
      attempt += 1;
      const retryAfter = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
      await sleep(Number.isFinite(retryAfter) ? Math.min(retryAfter * 1e3, 3e4) : backoff(attempt));
    }
  }
  /** Strip trailing slashes; undefined param values are dropped. */
  buildUrl(path, params) {
    let normalizedPath = path.startsWith("/") ? path : `/${path}`;
    if (normalizedPath.length > 1) normalizedPath = normalizedPath.replace(/\/+$/, "");
    let url = `${this.baseUrl}${normalizedPath}`;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value === void 0) continue;
        searchParams.append(key, String(value));
      }
      const qs = searchParams.toString();
      if (qs) url += `${url.includes("?") ? "&" : "?"}${qs}`;
    }
    return url;
  }
};

// src/resources/accounts.ts
var AccountsResource = class {
  constructor(http) {
    this.http = http;
  }
  http;
  /** The Group Methods docs list account creation as `POST /accounts` (unscoped by group in the path). */
  async create(data) {
    return this.http.request("/accounts", { method: "POST", body: data });
  }
  async get(accountId) {
    return this.http.request(`/accounts/${encodeURIComponent(accountId)}`);
  }
  async update(accountId, data) {
    return this.http.request(`/accounts/${encodeURIComponent(accountId)}`, {
      method: "PUT",
      body: data
    });
  }
};

// src/types/index.ts
function unwrapList(body, ...wrapperKeys) {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    const b = body;
    for (const key of wrapperKeys) {
      const value = b[key];
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

// src/resources/dub-points.ts
var DubPointsResource = class {
  constructor(http) {
    this.http = http;
  }
  http;
  async list(accountId) {
    const body = await this.http.request(`/accounts/${encodeURIComponent(accountId)}/dub_points`);
    return unwrapList(body, "dub_points", "data");
  }
  async create(accountId, data) {
    return this.http.request(`/accounts/${encodeURIComponent(accountId)}/dub_points`, {
      method: "POST",
      body: data
    });
  }
  async get(dubPointId) {
    return this.http.request(`/dub_points/${encodeURIComponent(dubPointId)}`);
  }
  /** Look up a Dub.Point by external-system identifiers (e.g. a BroadWorks user id). */
  async find(params) {
    const body = await this.http.request("/dub_points/find", { params });
    return unwrapList(body, "dub_points", "data");
  }
};

// src/resources/groups.ts
var GroupsResource = class {
  constructor(http) {
    this.http = http;
  }
  http;
  async get(groupId) {
    return this.http.request(`/groups/${encodeURIComponent(groupId)}`);
  }
  async createChild(groupId, data) {
    return this.http.request(`/groups/${encodeURIComponent(groupId)}/groups`, {
      method: "POST",
      body: data
    });
  }
  async listUnidentifiedRecordings(groupId) {
    const body = await this.http.request(
      `/groups/${encodeURIComponent(groupId)}/unidentified_recordings`
    );
    return unwrapList(body, "recordings", "data");
  }
  async createUnidentifiedRecording(groupId, data) {
    return this.http.request(
      `/groups/${encodeURIComponent(groupId)}/unidentified_recordings`,
      { method: "POST", body: data }
    );
  }
};

// src/resources/notifications.ts
var NotificationsResource = class {
  constructor(http) {
    this.http = http;
  }
  http;
  async list(accountId) {
    const body = await this.http.request(`/accounts/${encodeURIComponent(accountId)}/notifications`);
    return unwrapList(body, "notifications", "data");
  }
  async create(accountId, data) {
    return this.http.request(`/accounts/${encodeURIComponent(accountId)}/notifications`, {
      method: "POST",
      body: data
    });
  }
  async get(notificationId) {
    return this.http.request(`/notifications/${encodeURIComponent(notificationId)}`);
  }
  async update(notificationId, data) {
    return this.http.request(`/notifications/${encodeURIComponent(notificationId)}`, {
      method: "PUT",
      body: data
    });
  }
  /** A newly created rest hook needs an explicit activation step before it fires. */
  async activate(notificationId) {
    return this.http.request(`/notifications/${encodeURIComponent(notificationId)}/activate`, {
      method: "POST"
    });
  }
  /** Unclaimed/undelivered notification events pending for this subscription. */
  async listUnclaimed(notificationId) {
    const body = await this.http.request(
      `/notifications/${encodeURIComponent(notificationId)}/unclaimed`
    );
    return unwrapList(body, "events", "data");
  }
  async delete(notificationId) {
    await this.http.request(`/notifications/${encodeURIComponent(notificationId)}`, {
      method: "DELETE"
    });
  }
};

// src/resources/profile.ts
var ProfileResource = class {
  constructor(http) {
    this.http = http;
  }
  http;
  /** The authenticated user/application's own profile. */
  async get() {
    return this.http.request("/profile");
  }
};

// src/resources/recordings.ts
var RecordingsResource = class {
  constructor(http) {
    this.http = http;
  }
  http;
  async list(accountId, params) {
    const body = await this.http.request(`/accounts/${encodeURIComponent(accountId)}/recordings`, {
      params
    });
    return unwrapList(body, "recordings", "data");
  }
  /** Single-shot recording upload/creation. */
  async create(accountId, data) {
    return this.http.request(`/accounts/${encodeURIComponent(accountId)}/recordings`, {
      method: "POST",
      body: data
    });
  }
  async get(recordingId) {
    return this.http.request(`/recordings/${encodeURIComponent(recordingId)}`);
  }
  async getWaveform(recordingId) {
    return this.http.request(`/recordings/${encodeURIComponent(recordingId)}/waveform`);
  }
  /** Fetch the recorded audio itself as binary (content-type/filename from response headers). */
  async download(recordingId) {
    return this.http.request(`/recordings/${encodeURIComponent(recordingId)}`, {
      responseType: "binary",
      headers: { Accept: "audio/*, */*" }
    });
  }
  async delete(recordingId) {
    await this.http.request(`/recordings/${encodeURIComponent(recordingId)}`, { method: "DELETE" });
  }
  async updateMetadata(recordingId, metadata) {
    return this.http.request(`/recordings/${encodeURIComponent(recordingId)}/metadata`, {
      method: "PUT",
      body: metadata
    });
  }
  async addTags(recordingId, tags) {
    return this.http.request(`/recordings/${encodeURIComponent(recordingId)}/tags`, {
      method: "POST",
      body: { tags }
    });
  }
  async deleteTags(recordingId, tags) {
    return this.http.request(`/recordings/${encodeURIComponent(recordingId)}/tags`, {
      method: "DELETE",
      body: { tags }
    });
  }
  /** Multipart upload, step 1: initiate. Same endpoint as {@link create}; the account_id path distinguishes it. */
  async initiateMultipart(accountId, data) {
    return this.create(accountId, { ...data, multipart: true });
  }
  /** Multipart upload, step 2: get the target/part URL to PUT audio bytes to. */
  async getUploadTarget(recordingId) {
    return this.http.request(`/recordings/${encodeURIComponent(recordingId)}/upload`);
  }
  /** Multipart upload, step 3: mark the upload complete once all parts are sent. */
  async completeUpload(recordingId, data) {
    return this.http.request(`/recordings/${encodeURIComponent(recordingId)}/complete_upload`, {
      method: "PUT",
      body: data ?? {}
    });
  }
};

// src/resources/users.ts
var UsersResource = class {
  constructor(http) {
    this.http = http;
  }
  http;
  async list(accountId) {
    const body = await this.http.request(`/accounts/${encodeURIComponent(accountId)}/users`);
    return unwrapList(body, "users", "data");
  }
  async create(accountId, data) {
    return this.http.request(`/accounts/${encodeURIComponent(accountId)}/users`, {
      method: "POST",
      body: data
    });
  }
  async get(userId) {
    return this.http.request(`/users/${encodeURIComponent(userId)}`);
  }
  async update(userId, data) {
    return this.http.request(`/users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      body: data
    });
  }
  async delete(userId) {
    await this.http.request(`/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
  }
};

// src/client.ts
var DubberClient = class {
  groups;
  accounts;
  recordings;
  users;
  profile;
  notifications;
  dubPoints;
  auth;
  baseUrl;
  clientId;
  clientSecret;
  constructor(config) {
    for (const key of ["clientId", "clientSecret", "authId", "authToken"]) {
      const value = config[key];
      if (typeof value !== "string" || value.trim() === "") {
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
      cache
    });
    const http = new HttpClient({
      baseUrl,
      auth: this.auth,
      ...config.maxRetries !== void 0 ? { maxRetries: config.maxRetries } : {}
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
  async testConnection() {
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
  async revokeToken() {
    const token = await this.auth.getToken();
    const base = this.baseUrl.replace(/\/+$/, "");
    const response = await fetch(`${base}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token: token.accessToken,
        client_id: this.clientId,
        client_secret: this.clientSecret
      }).toString(),
      signal: AbortSignal.timeout(3e4)
    });
    if (!response.ok) {
      const rawText = await response.text();
      let body = rawText;
      try {
        body = JSON.parse(rawText);
      } catch {
      }
      throw parseDubberError(response.status, body, response.headers);
    }
  }
};
export {
  API_HOST,
  AccountsResource,
  AuthenticationError,
  ConflictError,
  DEFAULT_REGION,
  DubPointsResource,
  DubberClient,
  DubberError,
  DubberTokenProvider,
  ForbiddenError,
  GroupsResource,
  HttpClient,
  NotFoundError,
  NotificationsResource,
  ProfileResource,
  RateLimitError,
  RecordingsResource,
  ServerError,
  TOKEN_PATH,
  TokenCache,
  UsersResource,
  ValidationError,
  baseUrlForRegion,
  defaultTokenCache,
  parseDubberError,
  unwrapList
};
//# sourceMappingURL=index.js.map