import { http, HttpResponse } from 'msw';

import { DubberClient, TokenCache } from '../src/index.js';
import { BASE } from './mocks/handlers.js';
import { server } from './mocks/server.js';

export { BASE };

/** A client with fake credentials and a fresh TokenCache (no cross-test token reuse). */
export function makeClient({ maxRetries = 0 }: { maxRetries?: number } = {}): DubberClient {
  return new DubberClient({
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    authId: 'test-auth-id',
    authToken: 'test-auth-token',
    region: 'sandbox',
    maxRetries,
    tokenCache: new TokenCache(),
  });
}

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

const DEFAULT_BODIES: Record<number, unknown> = {
  400: { message: 'Invalid request' },
  401: { error: 'invalid_token', error_description: 'Access token expired' },
  403: { message: 'Access denied' },
  404: { message: 'Resource not found' },
  409: { message: 'Conflict' },
  429: { message: 'Rate limit exceeded' },
  500: { message: 'Unexpected error' },
};

/** Override one route (path relative to BASE) to answer a fixed error status. Reset by afterEach. */
export function respondWithError(method: Method, path: string, status: number, body?: unknown): void {
  server.use(
    http[method](`${BASE}${path}`, () =>
      HttpResponse.json((body ?? DEFAULT_BODIES[status] ?? { message: `HTTP ${status}` }) as never, { status })
    )
  );
}
