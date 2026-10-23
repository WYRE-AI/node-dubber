# node-dubber

Node.js / TypeScript client library for the [Dubber](https://dubber.net) API
Store — call recording upload/retrieval, compliance metadata/tags, group and
account management, users, REST-hook (webhook) notifications, and Dub.Point
telecom-system (e.g. BroadWorks) integration.

## Install

```bash
npm install @wyre-ai/node-dubber
```

## Quick start

```ts
import { DubberClient } from '@wyre-ai/node-dubber';

const client = new DubberClient({
  clientId: process.env.DUBBER_CLIENT_ID!,      // Mashery application key
  clientSecret: process.env.DUBBER_CLIENT_SECRET!,
  authId: process.env.DUBBER_AUTH_ID!,          // Dubber portal → API tab
  authToken: process.env.DUBBER_AUTH_TOKEN!,    // Dubber portal → API tab
  region: 'sandbox',                            // 'sandbox' for testing; a region segment for production
});

const recordings = await client.recordings.list('acc-1');
const recording = await client.recordings.get(recordings[0].id);
```

## Authentication

Dubber uses an OAuth2 **password grant**, but `username`/`password` are not a
human login — they are the Dubber Auth ID / Dubber Auth Token pair from the
Dubber portal's API tab, paired with the Mashery `client_id`/`client_secret`
issued when you register an app at developer.dubber.net. All four values are
required. Tokens are cached process-wide and re-minted on expiry (24h
documented lifetime); there is no refresh-token flow implemented here (see
`auth.ts` for why).

## Regions

Every endpoint is served from `https://api.dubber.net/<region>/v1`. `sandbox`
is the free self-serve testing environment. Production is region-scoped —
confirm your exact region segment with Dubber before pointing at production;
shipping against the wrong region silently talks to the wrong tenant.

## API coverage

| Resource | Client namespace | Endpoints |
|---|---|---|
| Groups | `client.groups` | get, createChild, unidentified recordings (list/create) |
| Accounts | `client.accounts` | create, get, update |
| Recordings | `client.recordings` | list, create, get, download, delete, updateMetadata, addTags, deleteTags, waveform, multipart upload (initiate/getUploadTarget/completeUpload) |
| Users | `client.users` | list, create, get, update, delete |
| Profile | `client.profile` | get |
| Notifications (REST hooks) | `client.notifications` | list, create, get, update, activate, listUnclaimed, delete |
| Dub.Point | `client.dubPoints` | list (user filter, pagination), listAll, create, get, find |
| OAuth | `client.revokeToken()`, `client.testConnection()` | token revoke, connection test |

## Recording links

`recordings.get(id)` returns details only. To get a playable link, pass a
`listener`: the email of an existing Dubber user who has access to the recording.

```ts
const rec = await client.recordings.get('rec-id', {
  listener: 'agent@example.com',
  content_disposition: 'attachment;filename=call.mp3', // optional
});
rec.recording_url; // pre-signed S3 URL
```

`content_disposition` must be `inline` (Dubber's default), `attachment`, or
`attachment;filename=<name>.mp3` (only mp3 names are supported); anything else
throws a `ValidationError` before a request is made.

`recording_url` is a **pre-signed, short-lived** URL whose query string carries
AWS credentials. Treat it as a secret: anyone holding it can fetch the audio
until it expires. Don't log it, store it, or put it in analytics/error reports;
fetch it right before use. The same applies to `waveform_url` from
`recordings.getWaveform`. The SDK itself never logs URLs or response bodies.

## Dub.Point user filter

```ts
await client.dubPoints.list('acc-1', { user: 'USER_ID', count: 100, page: 2 });
await client.dubPoints.listAll('acc-1', { user: 'USER_ID' }); // deduped, up to 50 requests
const { dubPoints, truncated, requests } = await client.dubPoints.listAllWithStatus('acc-1', { user: 'USER_ID' });
await client.dubPoints.listAll('acc-1', { user: 'USER_ID', onLimit: 'throw' });
```

`user` is a Dubber user id (the `user` field on a dub point is a URL ending in
that id). `count` is 1–100 (Dubber default 20). Dubber doesn't document whether
`page` is 0- or 1-based, so `listAll` is defensive: it omits `page` first, then
requests `page=1,2,...`, dedupes by id, stops on a short page or no new ids, and
makes at most 50 requests. `listAllWithStatus` reports `truncated: true` when the
cap leaves possible additional results; default `listAll` still returns the collected array.
With `onLimit: 'throw'`, it instead throws `PaginationLimitError` with the collected dub points in `partial`.

## Error handling

Every non-2xx response throws a `DubberError` subclass:
`AuthenticationError` (401), `ForbiddenError` (403), `NotFoundError` (404),
`ValidationError` (400/422), `ConflictError` (409), `RateLimitError` (429,
carries `retryAfter`), `ServerError` (5xx).
`PaginationLimitError` is a local `DubberError` thrown when `listAll` reaches its
request cap with possible additional results and `onLimit` is `'throw'`.

```ts
import { NotFoundError } from '@wyre-ai/node-dubber';

try {
  await client.recordings.get('missing-id');
} catch (err) {
  if (err instanceof NotFoundError) {
    // handle
  }
}
```

## A note on API coverage confidence

Dubber does not publish a downloadable OpenAPI/Swagger spec. Every endpoint
path in this client was verified against the live interactive `/io-docs`
console and the official Getting Started Guide, but full response-body
schemas were not — see `src/types/index.ts` and `CONTRIBUTING.md`.

## License

Apache-2.0
