import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { AuthenticationError, HttpClient, NotFoundError, ServerError } from '../src/index.js';
import { BASE, makeClient, respondWithError } from './helpers.js';
import { server } from './mocks/server.js';

describe('HttpClient', () => {
  it('reads a successful JSON body', async () => {
    const client = makeClient();
    const account = await client.accounts.get('acc-1');
    expect(account.id).toBe('acc-1');
  });

  it('maps a 404 to NotFoundError without retrying', async () => {
    let attempts = 0;
    server.use(
      http.get(`${BASE}/recordings/:recordingId`, () => {
        attempts += 1;
        return HttpResponse.json({ message: 'gone' }, { status: 404 });
      })
    );
    await expect(makeClient({ maxRetries: 3 }).recordings.get('rec-1')).rejects.toBeInstanceOf(NotFoundError);
    expect(attempts).toBe(1);
  });

  it('retries a GET on 503 up to maxRetries, then succeeds', async () => {
    let attempts = 0;
    server.use(
      http.get(`${BASE}/accounts/:accountId`, () => {
        attempts += 1;
        return attempts < 3
          ? HttpResponse.json({ message: 'unavailable' }, { status: 503 })
          : HttpResponse.json({ id: 'acc-1', name: 'Test Account' });
      })
    );
    const account = await makeClient({ maxRetries: 3 }).accounts.get('acc-1');
    expect(account.id).toBe('acc-1');
    expect(attempts).toBe(3);
  });

  it('never retries a non-idempotent write on 503, even with maxRetries set', async () => {
    let attempts = 0;
    server.use(
      http.delete(`${BASE}/recordings/:recordingId`, () => {
        attempts += 1;
        return HttpResponse.json({ message: 'unavailable' }, { status: 503 });
      })
    );
    await expect(makeClient({ maxRetries: 3 }).recordings.delete('rec-1')).rejects.toBeInstanceOf(ServerError);
    expect(attempts).toBe(1);
  });

  it('refreshes the token on 401 and retries once, transparently to the caller', async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/profile`, ({ request }) => {
        calls += 1;
        const auth = request.headers.get('authorization');
        return auth === 'Bearer fake-access-token' && calls > 1
          ? HttpResponse.json({ id: 'usr-1' })
          : HttpResponse.json({ error: 'invalid_token' }, { status: 401 });
      })
    );
    const profile = await makeClient().profile.get();
    expect(profile.id).toBe('usr-1');
    expect(calls).toBe(2);
  });

  it('does not retry a second consecutive 401 (refresh attempted once)', async () => {
    respondWithError('get', '/profile', 401);
    await expect(makeClient().profile.get()).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('reads binary responses with content-type and filename', async () => {
    server.use(
      http.get(`${BASE}/recordings/:recordingId`, () =>
        new HttpResponse(new Uint8Array([1, 2, 3]), {
          headers: { 'content-type': 'audio/wav', 'content-disposition': 'attachment; filename="rec-1.wav"' },
        })
      )
    );
    const download = await makeClient().recordings.download('rec-1');
    expect(download.contentType).toBe('audio/wav');
    expect(download.filename).toBe('rec-1.wav');
    expect(Array.from(download.data)).toEqual([1, 2, 3]);
  });

  it('drops undefined query params and keeps the rest', async () => {
    let seenUrl: URL | undefined;
    server.use(
      http.get(`${BASE}/accounts/:accountId/recordings`, ({ request }) => {
        seenUrl = new URL(request.url);
        return HttpResponse.json({ data: [] });
      })
    );
    await makeClient().recordings.list('acc-1', { limit: 10, offset: undefined });
    expect(seenUrl!.searchParams.get('limit')).toBe('10');
    expect(seenUrl!.searchParams.has('offset')).toBe(false);
  });

  it('strips a trailing slash from a configured baseUrl', async () => {
    const client = new HttpClient({ baseUrl: `${BASE}/` });
    server.use(http.get(`${BASE}/profile`, () => HttpResponse.json({ id: 'usr-1' })));
    await expect(client.request('/profile')).resolves.toEqual({ id: 'usr-1' });
  });
});
