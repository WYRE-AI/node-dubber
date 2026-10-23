import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { BASE, makeClient } from './helpers.js';
import { server } from './mocks/server.js';

describe('GroupsResource', () => {
  it('get / createChild / unidentified recordings', async () => {
    const client = makeClient();
    await expect(client.groups.get('grp-1')).resolves.toMatchObject({ id: 'grp-1' });
    await expect(client.groups.createChild('grp-1', { name: 'Child' })).resolves.toMatchObject({ id: 'grp-2' });
    await expect(client.groups.listUnidentifiedRecordings('grp-1')).resolves.toEqual([
      expect.objectContaining({ id: 'rec-1' }),
    ]);
    await expect(client.groups.createUnidentifiedRecording('grp-1', {})).resolves.toMatchObject({ id: 'rec-1' });
  });
});

describe('AccountsResource', () => {
  it('create / get / update', async () => {
    const client = makeClient();
    await expect(client.accounts.create({ name: 'New Acct' })).resolves.toMatchObject({ id: 'acc-1' });
    await expect(client.accounts.get('acc-1')).resolves.toMatchObject({ id: 'acc-1' });
    await expect(client.accounts.update('acc-1', { timezone: 'Australia/Sydney' })).resolves.toMatchObject({
      id: 'acc-1',
    });
  });
});

describe('RecordingsResource', () => {
  it('list / create / get / waveform / metadata / tags', async () => {
    const client = makeClient();
    await expect(client.recordings.list('acc-1')).resolves.toEqual([expect.objectContaining({ id: 'rec-1' })]);
    await expect(client.recordings.create('acc-1', {})).resolves.toMatchObject({ id: 'rec-1' });
    await expect(client.recordings.get('rec-1')).resolves.toMatchObject({ id: 'rec-1' });
    await expect(client.recordings.getWaveform('rec-1')).resolves.toMatchObject({ recording_id: 'rec-1' });
    await expect(client.recordings.updateMetadata('rec-1', { caseId: '123' })).resolves.toMatchObject({
      id: 'rec-1',
    });
    await expect(client.recordings.addTags('rec-1', ['vip'])).resolves.toMatchObject({ id: 'rec-1' });
    await expect(client.recordings.deleteTags('rec-1', ['vip'])).resolves.toMatchObject({ id: 'rec-1' });
    await expect(client.recordings.delete('rec-1')).resolves.toBeUndefined();
  });

  it('multipart upload: initiate / get upload target / complete', async () => {
    const client = makeClient();
    await expect(client.recordings.initiateMultipart('acc-1', {})).resolves.toMatchObject({ id: 'rec-1' });
    await expect(client.recordings.getUploadTarget('rec-1')).resolves.toMatchObject({
      recording_id: 'rec-1',
      upload_url: expect.any(String),
    });
    await expect(client.recordings.completeUpload('rec-1')).resolves.toMatchObject({ id: 'rec-1' });
  });
});

describe('UsersResource', () => {
  it('list / create / get / update / delete', async () => {
    const client = makeClient();
    await expect(client.users.list('acc-1')).resolves.toEqual([expect.objectContaining({ id: 'usr-1' })]);
    await expect(client.users.create('acc-1', { email: 'a@b.com' })).resolves.toMatchObject({ id: 'usr-1' });
    await expect(client.users.get('usr-1')).resolves.toMatchObject({ id: 'usr-1' });
    await expect(client.users.update('usr-1', { name: 'New Name' })).resolves.toMatchObject({ id: 'usr-1' });
    await expect(client.users.delete('usr-1')).resolves.toBeUndefined();
  });
});

describe('ProfileResource', () => {
  it('get', async () => {
    await expect(makeClient().profile.get()).resolves.toMatchObject({ id: 'usr-1' });
  });
});

describe('NotificationsResource', () => {
  it('list / create / get / update / activate / unclaimed / delete', async () => {
    const client = makeClient();
    await expect(client.notifications.list('acc-1')).resolves.toEqual([
      expect.objectContaining({ id: 'notif-1' }),
    ]);
    await expect(
      client.notifications.create('acc-1', { url: 'https://example.com/hook', event: 'recording.created' })
    ).resolves.toMatchObject({ id: 'notif-1' });
    await expect(client.notifications.get('notif-1')).resolves.toMatchObject({ id: 'notif-1' });
    await expect(client.notifications.update('notif-1', { url: 'https://example.com/hook2' })).resolves.toMatchObject(
      { id: 'notif-1' }
    );
    await expect(client.notifications.activate('notif-1')).resolves.toMatchObject({ active: true });
    await expect(client.notifications.listUnclaimed('notif-1')).resolves.toEqual([]);
    await expect(client.notifications.delete('notif-1')).resolves.toBeUndefined();
  });
});

describe('DubPointsResource', () => {
  it('list / create / get / find', async () => {
    const client = makeClient();
    await expect(client.dubPoints.list('acc-1')).resolves.toEqual([expect.objectContaining({ id: 'dp-1' })]);
    await expect(client.dubPoints.create('acc-1', { name: 'Trunk A' })).resolves.toMatchObject({ id: 'dp-1' });
    await expect(client.dubPoints.get('dp-1')).resolves.toMatchObject({ id: 'dp-1' });
    await expect(client.dubPoints.find({ external_id: 'bw-123' })).resolves.toEqual([
      expect.objectContaining({ id: 'dp-1' }),
    ]);
  });
});

describe('RecordingsResource list paging', () => {
  const LIST = `${BASE}/accounts/:accountId/recordings`;

  /** Mock Dubber: newest-first dataset, honours count/before_id, ignores everything else. */
  function mockDataset(total: number, seen: URL[] = []): URL[] {
    const all = Array.from({ length: total }, (_, i) => ({ id: `r${String(total - i).padStart(4, '0')}` }));
    server.use(
      http.get(LIST, ({ request }) => {
        const url = new URL(request.url);
        seen.push(url);
        const count = Number(url.searchParams.get('count') ?? 20);
        const before = url.searchParams.get('before_id');
        const start = before ? all.findIndex((r) => r.id === before) + 1 : 0;
        return HttpResponse.json({ recordings: all.slice(start, start + count) });
      })
    );
    return seen;
  }

  it('sends Dubber wire params and never limit/offset', async () => {
    const seen = mockDataset(5);
    await makeClient().recordings.list('acc-1', { count: 50, before_id: 'r0003', dub_point: 'dp-1', query: 'x' });
    const q = seen[0]!.searchParams;
    expect(Object.fromEntries(q)).toEqual({ count: '50', before_id: 'r0003', dub_point: 'dp-1', query: 'x' });
    expect(q.has('limit')).toBe(false);
    expect(q.has('offset')).toBe(false);
  });

  it('maps legacy limit to count', async () => {
    const seen = mockDataset(5);
    await makeClient().recordings.list('acc-1', { limit: 7 });
    expect(seen[0]!.searchParams.get('count')).toBe('7');
    expect(seen[0]!.searchParams.has('limit')).toBe(false);
  });

  it('throws on offset, pointing at before_id and iterate', async () => {
    const seen = mockDataset(5);
    await expect(makeClient().recordings.list('acc-1', { offset: 40 })).rejects.toThrow(/before_id.*iterate/s);
    await expect(makeClient().recordings.list('acc-1', { limit: 10, offset: 0 })).rejects.toThrow(/offset/);
    expect(seen).toHaveLength(0);
  });

  it('validates params client-side', async () => {
    const r = makeClient().recordings;
    for (const bad of [0, 101, 1.5, NaN]) {
      await expect(r.list('acc-1', { count: bad })).rejects.toThrow(/between 1 and 100/);
      await expect(r.list('acc-1', { limit: bad })).rejects.toThrow(/between 1 and 100/);
    }
    await expect(r.list('acc-1', { page: 1, before_id: 'a' })).rejects.toThrow(/page/);
    await expect(r.list('acc-1', { page: 1, after_id: 'a' })).rejects.toThrow(/page/);
    await expect(r.list('acc-1', { dub_point: 'a', team: 'b' })).rejects.toThrow(/dub_point/);
  });

  it('iterate returns all 450 recordings in order and stops on a short page', async () => {
    const seen = mockDataset(450);
    const ids: string[] = [];
    for await (const rec of makeClient().recordings.iterate('acc-1', { dub_point: 'dp-1' })) ids.push(rec.id);
    expect(ids).toHaveLength(450);
    expect(ids[0]).toBe('r0450');
    expect(ids[449]).toBe('r0001');
    expect(new Set(ids).size).toBe(450);
    expect([...ids].sort().reverse()).toEqual(ids);
    expect(seen).toHaveLength(5);
    expect(seen[0]!.searchParams.get('count')).toBe('100');
    expect(seen[0]!.searchParams.has('before_id')).toBe(false);
    expect(seen[1]!.searchParams.get('before_id')).toBe('r0351');
    expect(seen.every((u) => u.searchParams.get('dub_point') === 'dp-1' && !u.searchParams.has('offset'))).toBe(true);
  });

  it('iterate does one extra request when the total is an exact multiple, then stops on empty', async () => {
    const seen = mockDataset(200);
    const ids: string[] = [];
    for await (const rec of makeClient().recordings.iterate('acc-1', { count: 100 })) ids.push(rec.id);
    expect(ids).toHaveLength(200);
    expect(seen).toHaveLength(3);
  });

  it('iterate honours a starting before_id', async () => {
    const seen = mockDataset(30);
    const ids: string[] = [];
    for await (const rec of makeClient().recordings.iterate('acc-1', { before_id: 'r0010' })) ids.push(rec.id);
    expect(ids).toHaveLength(9);
    expect(seen[0]!.searchParams.get('before_id')).toBe('r0010');
  });
});
