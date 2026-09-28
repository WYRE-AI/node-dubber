import { describe, expect, it } from 'vitest';

import {
  AuthenticationError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  ServerError,
  ValidationError,
  parseDubberError,
} from '../src/index.js';

describe('parseDubberError', () => {
  it.each([
    [400, ValidationError],
    [401, AuthenticationError],
    [403, ForbiddenError],
    [404, NotFoundError],
    [409, ConflictError],
    [422, ValidationError],
    [500, ServerError],
    [503, ServerError],
  ] as const)('maps HTTP %i to %s', (status, ctor) => {
    const error = parseDubberError(status, { message: 'boom' });
    expect(error).toBeInstanceOf(ctor);
    expect(error.statusCode).toBe(status);
    expect(error.message).toBe('boom');
  });

  it('extracts message from {error_description}, {error.message} and {Error} shapes', () => {
    expect(parseDubberError(400, { error_description: 'bad token' }).message).toBe('bad token');
    expect(parseDubberError(400, { error: { message: 'nested' } }).message).toBe('nested');
    expect(parseDubberError(400, { Error: 'legacy shape' }).message).toBe('legacy shape');
  });

  it('falls back to the raw text body', () => {
    expect(parseDubberError(500, 'plain text failure').message).toBe('plain text failure');
  });

  it('falls back to a generic message when nothing is extractable', () => {
    expect(parseDubberError(418, {}).message).toBe('HTTP 418');
  });

  it('reads retry-after into RateLimitError, defaulting to 5s', () => {
    expect((parseDubberError(429, {}) as RateLimitError).retryAfter).toBe(5);
    const headers = new Headers({ 'retry-after': '30' });
    expect((parseDubberError(429, {}, headers) as RateLimitError).retryAfter).toBe(30);
  });
});
