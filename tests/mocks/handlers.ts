import { http, HttpResponse } from 'msw';

import * as fixtures from '../fixtures/index.js';

export const BASE = 'https://api.dubber.net/sandbox/v1';

export const handlers = [
  http.post(`${BASE}/token`, async ({ request }) => {
    const form = new URLSearchParams(await request.text());
    if (
      form.get('grant_type') !== 'password' ||
      !form.get('client_id') ||
      !form.get('client_secret') ||
      !form.get('username') ||
      !form.get('password')
    ) {
      return HttpResponse.json(fixtures.invalidGrantBody, { status: 401 });
    }
    return HttpResponse.json(fixtures.tokenBody);
  }),

  http.get(`${BASE}/groups/:groupId`, () => HttpResponse.json(fixtures.group)),
  http.post(`${BASE}/groups/:groupId/groups`, () => HttpResponse.json({ ...fixtures.group, id: 'grp-2' })),
  http.get(`${BASE}/groups/:groupId/unidentified_recordings`, () =>
    HttpResponse.json({ recordings: [fixtures.recording] })
  ),
  http.post(`${BASE}/groups/:groupId/unidentified_recordings`, () => HttpResponse.json(fixtures.recording)),

  http.post(`${BASE}/accounts`, () => HttpResponse.json(fixtures.account)),
  http.get(`${BASE}/accounts/:accountId`, () => HttpResponse.json(fixtures.account)),
  http.put(`${BASE}/accounts/:accountId`, () => HttpResponse.json(fixtures.account)),

  http.get(`${BASE}/accounts/:accountId/recordings`, () => HttpResponse.json({ data: [fixtures.recording] })),
  http.post(`${BASE}/accounts/:accountId/recordings`, () => HttpResponse.json(fixtures.recording)),
  http.get(`${BASE}/recordings/:recordingId`, () => HttpResponse.json(fixtures.recording)),
  http.get(`${BASE}/recordings/:recordingId/waveform`, () => HttpResponse.json({ recording_id: 'rec-1', points: [] })),
  http.delete(`${BASE}/recordings/:recordingId`, () => new HttpResponse(null, { status: 204 })),
  http.put(`${BASE}/recordings/:recordingId/metadata`, () => HttpResponse.json(fixtures.recording)),
  http.post(`${BASE}/recordings/:recordingId/tags`, () => HttpResponse.json(fixtures.recording)),
  http.delete(`${BASE}/recordings/:recordingId/tags`, () => HttpResponse.json(fixtures.recording)),
  http.get(`${BASE}/recordings/:recordingId/upload`, () =>
    HttpResponse.json({ recording_id: 'rec-1', upload_url: 'https://upload.example.com/part' })
  ),
  http.put(`${BASE}/recordings/:recordingId/complete_upload`, () => HttpResponse.json(fixtures.recording)),

  http.get(`${BASE}/accounts/:accountId/users`, () => HttpResponse.json({ users: [fixtures.dubberUser] })),
  http.post(`${BASE}/accounts/:accountId/users`, () => HttpResponse.json(fixtures.dubberUser)),
  http.get(`${BASE}/users/:userId`, () => HttpResponse.json(fixtures.dubberUser)),
  http.put(`${BASE}/users/:userId`, () => HttpResponse.json(fixtures.dubberUser)),
  http.delete(`${BASE}/users/:userId`, () => new HttpResponse(null, { status: 204 })),

  http.get(`${BASE}/profile`, () => HttpResponse.json(fixtures.profile)),

  http.get(`${BASE}/accounts/:accountId/notifications`, () =>
    HttpResponse.json({ notifications: [fixtures.notification] })
  ),
  http.post(`${BASE}/accounts/:accountId/notifications`, () => HttpResponse.json(fixtures.notification)),
  http.get(`${BASE}/notifications/:notificationId`, () => HttpResponse.json(fixtures.notification)),
  http.put(`${BASE}/notifications/:notificationId`, () => HttpResponse.json(fixtures.notification)),
  http.post(`${BASE}/notifications/:notificationId/activate`, () =>
    HttpResponse.json({ ...fixtures.notification, active: true })
  ),
  http.get(`${BASE}/notifications/:notificationId/unclaimed`, () => HttpResponse.json({ events: [] })),
  http.delete(`${BASE}/notifications/:notificationId`, () => new HttpResponse(null, { status: 204 })),

  http.get(`${BASE}/accounts/:accountId/dub_points`, () => HttpResponse.json({ dub_points: [fixtures.dubPoint] })),
  http.post(`${BASE}/accounts/:accountId/dub_points`, () => HttpResponse.json(fixtures.dubPoint)),
  http.get(`${BASE}/dub_points/find`, () => HttpResponse.json({ dub_points: [fixtures.dubPoint] })),
  http.get(`${BASE}/dub_points/:dubPointId`, () => HttpResponse.json(fixtures.dubPoint)),

  http.post(`${BASE}/revoke`, () => new HttpResponse(null, { status: 200 })),
];
