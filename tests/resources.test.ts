import { describe, expect, it } from 'vitest';

import { makeClient } from './helpers.js';

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
