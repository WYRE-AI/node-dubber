import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { AuthenticationError, DubberTokenProvider, TokenCache } from '../src/index.js';
import { tokenBody, invalidGrantBody } from './fixtures/index.js';
import { BASE } from './helpers.js';
import { server } from './mocks/server.js';

const TOKEN_URL = `${BASE}/token`;

function makeProvider(cache = new TokenCache(), clientSecret = 'secret'): DubberTokenProvider {
  return new DubberTokenProvider({
    baseUrl: BASE,
    clientId: 'id',
    clientSecret,
    authId: 'auth-id',
    authToken: 'auth-token',
    cache,
  });
}

function countMints(body: unknown = tokenBody, status = 200): { count: number } {
  const counter = { count: 0 };
  server.use(
    http.post(TOKEN_URL, () => {
      counter.count += 1;
      return HttpResponse.json(body as never, { status });
    })
  );
  return counter;
}

describe('DubberTokenProvider minting', () => {
  it('POSTs a form body with grant_type=password, client_id/secret, username/password (no Basic auth)', async () => {
    let seen: { form: URLSearchParams; contentType: string | null; accept: string | null; auth: boolean } | undefined;
    server.use(
      http.post(TOKEN_URL, async ({ request }) => {
        seen = {
          form: new URLSearchParams(await request.text()),
          contentType: request.headers.get('content-type'),
          accept: request.headers.get('accept'),
          auth: request.headers.has('authorization'),
        };
        return HttpResponse.json(tokenBody);
      })
    );
    expect(await makeProvider().headers()).toEqual({ Authorization: 'Bearer fake-access-token' });
    expect(seen!.form.get('grant_type')).toBe('password');
    expect(seen!.form.get('client_id')).toBe('id');
    expect(seen!.form.get('client_secret')).toBe('secret');
    expect(seen!.form.get('username')).toBe('auth-id');
    expect(seen!.form.get('password')).toBe('auth-token');
    expect(seen!.contentType).toBe('application/x-www-form-urlencoded');
    expect(seen!.accept).toBe('application/json');
    expect(seen!.auth).toBe(false);
  });

  it('parses the string expires_in into an absolute expiry', async () => {
    const before = Date.now();
    const token = await makeProvider().getToken();
    expect(token.accessToken).toBe('fake-access-token');
    expect(token.tokenType).toBe('bearer');
    expect(token.expiresAt).toBeGreaterThanOrEqual(before + 86_399_000);
  });

  it('caches the token across calls (one mint)', async () => {
    const counter = countMints();
    const provider = makeProvider();
    await provider.getToken();
    await provider.getToken();
    await provider.getToken();
    expect(counter.count).toBe(1);
  });

  it('single-flights concurrent mints for the same key', async () => {
    const counter = countMints();
    const provider = makeProvider();
    await Promise.all([provider.getToken(), provider.getToken(), provider.getToken()]);
    expect(counter.count).toBe(1);
  });

  it('does not share a cached token across different credentials', async () => {
    const cache = new TokenCache();
    const counter = countMints();
    await makeProvider(cache, 'secret-a').getToken();
    await makeProvider(cache, 'secret-b').getToken();
    expect(counter.count).toBe(2);
    expect(cache.size).toBe(2);
  });

  it('throws AuthenticationError and does not cache on a rejected grant', async () => {
    server.use(http.post(TOKEN_URL, () => HttpResponse.json(invalidGrantBody, { status: 401 })));
    const cache = new TokenCache();
    await expect(makeProvider(cache).getToken()).rejects.toBeInstanceOf(AuthenticationError);
    expect(cache.size).toBe(0);
  });

  it('retries a failed mint on the next call (in-flight promise is not cached)', async () => {
    let attempt = 0;
    server.use(
      http.post(TOKEN_URL, () => {
        attempt += 1;
        return attempt === 1
          ? HttpResponse.json(invalidGrantBody, { status: 401 })
          : HttpResponse.json(tokenBody);
      })
    );
    const provider = makeProvider();
    await expect(provider.getToken()).rejects.toThrow();
    await expect(provider.getToken()).resolves.toMatchObject({ accessToken: 'fake-access-token' });
    expect(attempt).toBe(2);
  });

  it('handleUnauthorized evicts the cached token and reports refreshed', async () => {
    const cache = new TokenCache();
    const provider = makeProvider(cache);
    await provider.getToken();
    expect(cache.size).toBe(1);
    await expect(provider.handleUnauthorized()).resolves.toBe(true);
    expect(cache.size).toBe(0);
  });
});

describe('TokenCache', () => {
  it('evicts the oldest entry once maxEntries is reached', () => {
    const cache = new TokenCache(2);
    cache.set('a', { accessToken: 'a', expiresAt: 0 });
    cache.set('b', { accessToken: 'b', expiresAt: 0 });
    cache.set('c', { accessToken: 'c', expiresAt: 0 });
    expect(cache.size).toBe(2);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('c')?.accessToken).toBe('c');
  });
});
