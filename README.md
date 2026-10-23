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

### Listing and paging recordings

`recordings.list` returns the newest 20 recordings by default. It takes Dubber's
own query params: `count` (1–100), `page`, `before_id`, `after_id`, `query`,
`dub_point` and `team`.

- Results are newest-first. Page with the `before_id` cursor: pass the `id` of
  the last recording of the previous page, and repeat until a page is empty or
  shorter than `count`.
- `page` works only for the first 5 pages (500 recordings) and cannot be
  combined with `before_id`/`after_id`. `dub_point` and `team` cannot be combined.
- Dubber has no server-side date/time filter, so the SDK has none either.
- `limit` is a deprecated alias for `count`. `offset` does not exist in Dubber
  (it was silently ignored, always returning the newest 20), so passing it now throws.

```ts
const page = await client.recordings.list('acc-1', { count: 100, dub_point: 'dp-1' });

// start_time is RFC 2822, which `new Date()` parses.
const cutoff = new Date('2026-10-19T00:00:00+11:00');

// Walk every recording, newest first (100 per request, following before_id):
for await (const rec of client.recordings.iterate('acc-1', { team: 'team-1' })) {
  if (rec.start_time && new Date(rec.start_time) < cutoff) break; // filter client-side
  console.log(rec.id);
}
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
| Dub.Point | `client.dubPoints` | list, create, get, find |
| OAuth | `client.revokeToken()`, `client.testConnection()` | token revoke, connection test |

## Error handling

Every non-2xx response throws a `DubberError` subclass:
`AuthenticationError` (401), `ForbiddenError` (403), `NotFoundError` (404),
`ValidationError` (400/422), `ConflictError` (409), `RateLimitError` (429,
carries `retryAfter`), `ServerError` (5xx).

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
