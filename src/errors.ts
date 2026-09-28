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
export class DubberError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public response: unknown
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 401, or a token-endpoint rejection. */
export class AuthenticationError extends DubberError {}

/** 403. */
export class ForbiddenError extends DubberError {}

export class NotFoundError extends DubberError {}

/** 400 / 422. */
export class ValidationError extends DubberError {}

export class ConflictError extends DubberError {}

/**
 * 429. The getting-started guide documents "500 calls for a token in a
 * 24-hour period" but no `Retry-After` convention — `retryAfter` defaults to
 * 5s and is overridden only if the response actually sends the header.
 */
export class RateLimitError extends DubberError {
  retryAfter = 5;
}

/** 5xx. */
export class ServerError extends DubberError {}

function str(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

/** Best-effort message extraction across the common REST error shapes. */
function extractMessage(body: unknown): string | undefined {
  if (typeof body === 'string') return body.trim() || undefined;
  if (body === null || typeof body !== 'object') return undefined;
  const b = body as Record<string, unknown>;
  return (
    str(b['message']) ??
    str(b['error_description']) ??
    str((b['error'] as Record<string, unknown> | undefined)?.['message']) ??
    str(b['error']) ??
    str(b['Error'])
  );
}

/** Map a non-2xx Dubber response to the matching {@link DubberError} subclass. */
export function parseDubberError(status: number, body: unknown, headers?: Headers): DubberError {
  const message = extractMessage(body);
  switch (status) {
    case 400:
    case 422:
      return new ValidationError(message ?? 'Bad request', status, body);
    case 401:
      return new AuthenticationError(message ?? 'Authentication failed', status, body);
    case 403:
      return new ForbiddenError(message ?? 'Forbidden', status, body);
    case 404:
      return new NotFoundError(message ?? 'Resource not found', status, body);
    case 409:
      return new ConflictError(message ?? 'Conflict', status, body);
    case 429: {
      const error = new RateLimitError(message ?? 'Rate limit exceeded', status, body);
      const retryAfter = Number.parseInt(headers?.get('retry-after') ?? '', 10);
      if (Number.isFinite(retryAfter)) error.retryAfter = retryAfter;
      return error;
    }
  }
  if (status >= 500) return new ServerError(message ?? `Server error: ${status}`, status, body);
  return new DubberError(message ?? `HTTP ${status}`, status, body);
}
