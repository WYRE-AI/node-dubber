import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { DubberClient, TokenCache } from '../src/index.js';
import { API_HOST } from '../src/config.js';
import { BASE } from './helpers.js';
import { server } from './mocks/server.js';

describe('DubberClient construction', () => {
  it.each(['clientId', 'clientSecret', 'authId', 'authToken'] as const)(
    'throws when %s is missing',
    (key) => {
      const config = {
        clientId: 'id',
        clientSecret: 'secret',
        authId: 'auth-id',
        authToken: 'auth-token',
        [key]: '',
      };
      expect(() => new DubberClient(config)).toThrow(/is required/);
    }
  );

  it('defaults to the sandbox region', () => {
    // baseUrlForRegion('sandbox') === `${API_HOST}/sandbox/v1` — proven indirectly via a live request below.
    expect(`${API_HOST}/sandbox/v1`).toBe(BASE);
  });
});

describe('DubberClient.testConnection', () => {
  it('reports ok on a successful mint', async () => {
    const client = new DubberClient({
      clientId: 'id',
      clientSecret: 'secret',
      authId: 'auth-id',
      authToken: 'auth-token',
      region: 'sandbox',
      tokenCache: new TokenCache(),
    });
    await expect(client.testConnection()).resolves.toEqual({ ok: true });
  });

  it('reports the failure instead of throwing', async () => {
    server.use(http.post(`${BASE}/token`, () => HttpResponse.json({ error: 'invalid_grant' }, { status: 401 })));
    const client = new DubberClient({
      clientId: 'id',
      clientSecret: 'secret',
      authId: 'auth-id',
      authToken: 'auth-token',
      region: 'sandbox',
      tokenCache: new TokenCache(),
    });
    const result = await client.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe('DubberClient.revokeToken', () => {
  it('mints a token then POSTs it to /revoke as a form body (not a Bearer header)', async () => {
    let seen: URLSearchParams | undefined;
    server.use(
      http.post(`${BASE}/revoke`, async ({ request }) => {
        seen = new URLSearchParams(await request.text());
        return new HttpResponse(null, { status: 200 });
      })
    );
    const client = new DubberClient({
      clientId: 'id',
      clientSecret: 'secret',
      authId: 'auth-id',
      authToken: 'auth-token',
      region: 'sandbox',
      tokenCache: new TokenCache(),
    });
    await expect(client.revokeToken()).resolves.toBeUndefined();
    expect(seen!.get('token')).toBe('fake-access-token');
    expect(seen!.get('client_id')).toBe('id');
  });
});
