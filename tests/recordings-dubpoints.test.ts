import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { BASE, makeClient } from './helpers.js';
import { server } from './mocks/server.js';

function captureGet(path: string, respond: (url: URL) => unknown): string[] {
  const seen: string[] = [];
  server.use(
    http.get(`${BASE}${path}`, ({ request }) => {
      seen.push(request.url);
      return HttpResponse.json(respond(new URL(request.url)) as never);
    })
  );
  return seen;
}

describe('recordings.get link params', () => {
  it('sends no query string without params', async () => {
    const seen = captureGet('/recordings/:id', () => ({ id: 'rec-1' }));
    await makeClient().recordings.get('rec-1');
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toContain('?');
  });

  it('url-encodes listener and content_disposition (wire names)', async () => {
    const seen = captureGet('/recordings/:id', () => ({ id: 'rec-1', recording_url: 'https://s3.example/x' }));
    const rec = await makeClient().recordings.get('rec-1', {
      listener: 'a+b@example.com',
      contentDisposition: 'attachment;filename=call 1.mp3',
    });
    expect(rec.recording_url).toBe('https://s3.example/x');
    expect(seen[0]).toContain('listener=a%2Bb%40example.com');
    expect(seen[0]).toContain('content_disposition=attachment%3Bfilename%3Dcall+1.mp3');
    expect(seen[0]).not.toContain('contentDisposition');
  });

  it.each(['inline', 'attachment', 'attachment;filename=x.mp3'])('accepts %s', async (cd) => {
    captureGet('/recordings/:id', () => ({ id: 'rec-1' }));
    await expect(makeClient().recordings.get('rec-1', { content_disposition: cd })).resolves.toBeDefined();
  });

  it.each(['bogus', 'attachment;filename=x.wav', 'attachment;filename=.mp3', 'attachment;filename=a;b.mp3', ''])(
    'rejects %j without a request',
    async (cd) => {
      const seen = captureGet('/recordings/:id', () => ({ id: 'rec-1' }));
      await expect(makeClient().recordings.get('rec-1', { content_disposition: cd })).rejects.toThrow(
        /content_disposition/
      );
      expect(seen).toHaveLength(0);
    }
  );
});

describe('dubPoints.list params', () => {
  it('sends user/count/page, and nothing by default', async () => {
    const seen = captureGet('/accounts/:id/dub_points', () => ({ dub_points: [] }));
    const c = makeClient();
    await c.dubPoints.list('acc-1');
    await c.dubPoints.list('acc-1', { user: 'u 1', count: 100, page: 2 });
    expect(seen[0]).not.toContain('?');
    const q = new URL(seen[1]!).searchParams;
    expect(q.get('user')).toBe('u 1');
    expect(q.get('count')).toBe('100');
    expect(q.get('page')).toBe('2');
  });

  it.each([0, 101, 1.5, -1, Number.NaN])('rejects count %s', async (count) => {
    await expect(makeClient().dubPoints.list('acc-1', { count })).rejects.toThrow(/count/);
  });
});

describe('dubPoints.listAll', () => {
  const mk = (from: number, n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `dp-${from + i}` }));

  it('pages until a short page, omitting page on the first request, deduping a repeated page', async () => {
    // Simulates 1-based paging: page=1 repeats the default first page.
    const pages: Record<string, ReturnType<typeof mk>> = { '': mk(0, 100), '1': mk(0, 100), '2': mk(100, 100), '3': mk(200, 7) };
    const seen = captureGet('/accounts/:id/dub_points', (url) => ({ dub_points: pages[url.searchParams.get('page') ?? ''] ?? [] }));
    const all = await makeClient().dubPoints.listAll('acc-1', { user: 'u1' });
    expect(all).toHaveLength(207);
    expect(new Set(all.map((d) => d.id)).size).toBe(207);
    const urls = seen.map((u) => new URL(u));
    expect(urls[0]!.searchParams.has('page')).toBe(false);
    expect(urls.map((u) => u.searchParams.get('page'))).toEqual([null, '1', '2', '3']);
    expect(urls.every((u) => u.searchParams.get('count') === '100' && u.searchParams.get('user') === 'u1')).toBe(true);
  });

  it('handles 0-based paging', async () => {
    const pages: Record<string, ReturnType<typeof mk>> = { '': mk(0, 100), '1': mk(100, 100), '2': mk(200, 0) };
    captureGet('/accounts/:id/dub_points', (url) => ({ dub_points: pages[url.searchParams.get('page') ?? ''] ?? [] }));
    expect(await makeClient().dubPoints.listAll('acc-1')).toHaveLength(200);
  });

  it('stops when the server ignores page (no new ids) and caps at 50 requests', async () => {
    const same = captureGet('/accounts/:id/dub_points', () => ({ dub_points: mk(0, 100) }));
    expect(await makeClient().dubPoints.listAll('acc-1')).toHaveLength(100);
    expect(same.length).toBeLessThanOrEqual(3);

    let n = 0;
    const endless = captureGet('/accounts/:id/dub_points', () => ({ dub_points: mk(100 * n++, 100) }));
    await makeClient().dubPoints.listAll('acc-1');
    expect(endless).toHaveLength(50);
  });
});
