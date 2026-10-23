import type { HttpClient } from '../http.js';
import type { BinaryResponse } from '../http.js';
import type { Recording, UploadTarget, Waveform } from '../types/index.js';
import { unwrapList } from '../types/index.js';

/** Query params for `GET /accounts/:id/recordings`, using Dubber's wire names. */
export interface ListRecordingsParams {
  /** Page size, integer 1–100 (Dubber default 20). */
  count?: number;
  /** Page number (Dubber allows at most 5 pages / 500 recordings). Cannot be combined with `before_id`/`after_id`. */
  page?: number;
  /** Cursor: return recordings older than this recording id. */
  before_id?: string;
  /** Return recordings newer than this recording id. */
  after_id?: string;
  /** Search string (semantics defined by Dubber). */
  query?: string;
  /** Only recordings for this dub point. Cannot be combined with `team`. */
  dub_point?: string;
  /** Only recordings for dub points in this team. Cannot be combined with `dub_point`. */
  team?: string;
  /** @deprecated Use `count`. Mapped to `count` (must be 1–100). */
  limit?: number;
  /** @deprecated Unsupported: Dubber has no offset. Passing it throws; use `before_id` or `iterate()`. */
  offset?: number;
}

/** Params for {@link RecordingsResource.iterate}. */
export interface IterateRecordingsParams {
  /** Page size per request, integer 1–100 (default 100). */
  count?: number;
  /** Start after this recording id (older than it). */
  before_id?: string;
  query?: string;
  dub_point?: string;
  team?: string;
}

function checkCount(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new RangeError(`recordings.list: \`${name}\` must be an integer between 1 and 100 (got ${String(value)})`);
  }
}

function toQuery(params: ListRecordingsParams | undefined): Record<string, string | number> | undefined {
  if (!params) return undefined;
  const { count, page, before_id, after_id, query, dub_point, team, limit, offset } = params;
  if (offset !== undefined) {
    throw new Error(
      'recordings.list: `offset` is not supported. Dubber has no offset paging and silently ignores it; ' +
        'it pages with a `before_id` cursor (id of the last recording of the previous page). ' +
        'Use `before_id`, or `client.recordings.iterate(accountId)` to walk all recordings.'
    );
  }
  if (limit !== undefined && count !== undefined && limit !== count) {
    throw new Error('recordings.list: pass either `count` or the deprecated `limit`, not both with different values');
  }
  const effectiveCount = count ?? limit;
  if (effectiveCount !== undefined) checkCount(count !== undefined ? 'count' : 'limit', effectiveCount);
  if (page !== undefined && (!Number.isInteger(page) || page < 0)) {
    throw new RangeError(`recordings.list: \`page\` must be a non-negative integer (got ${String(page)})`);
  }
  if (page !== undefined && (before_id !== undefined || after_id !== undefined)) {
    throw new Error('recordings.list: `page` cannot be combined with `before_id`/`after_id`');
  }
  if (dub_point !== undefined && team !== undefined) {
    throw new Error('recordings.list: `dub_point` and `team` cannot be used together');
  }
  const out: Record<string, string | number> = {};
  if (effectiveCount !== undefined) out.count = effectiveCount;
  if (page !== undefined) out.page = page;
  if (before_id !== undefined) out.before_id = before_id;
  if (after_id !== undefined) out.after_id = after_id;
  if (query !== undefined) out.query = query;
  if (dub_point !== undefined) out.dub_point = dub_point;
  if (team !== undefined) out.team = team;
  return out;
}

/**
 * Call recordings: single-shot upload, retrieval, metadata/tags, waveform,
 * and the multipart large-file variant (initiate → get upload target →
 * complete).
 */
export class RecordingsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List an account's recordings, newest first. Dubber returns 20 by default;
   * use `count` (max 100) and `before_id` to page, or {@link iterate} to walk all of them.
   */
  async list(accountId: string, params?: ListRecordingsParams): Promise<Recording[]> {
    const body = await this.http.request<unknown>(`/accounts/${encodeURIComponent(accountId)}/recordings`, {
      params: toQuery(params),
    });
    return unwrapList<Recording>(body, 'recordings', 'data');
  }

  /**
   * Walk an account's recordings newest-first, yielding each one. Pages with
   * `count` (default 100) and `before_id` = id of the last recording of the
   * previous page, until a page is empty or shorter than `count`. Dubber has
   * no date filter, so none is applied here; stop iterating when you have enough.
   */
  async *iterate(accountId: string, params: IterateRecordingsParams = {}): AsyncGenerator<Recording, void, undefined> {
    const { count = 100, before_id, query, dub_point, team } = params;
    let cursor = before_id;
    for (;;) {
      const page = await this.list(accountId, { count, before_id: cursor, query, dub_point, team });
      for (const recording of page) yield recording;
      if (page.length === 0 || page.length < count) return;
      const last = page[page.length - 1]!.id;
      if (last === undefined || last === null || last === '' || last === cursor) return;
      cursor = String(last);
    }
  }

  /** Single-shot recording upload/creation. */
  async create(accountId: string, data: Record<string, unknown>): Promise<Recording> {
    return this.http.request<Recording>(`/accounts/${encodeURIComponent(accountId)}/recordings`, {
      method: 'POST',
      body: data,
    });
  }

  async get(recordingId: string): Promise<Recording> {
    return this.http.request<Recording>(`/recordings/${encodeURIComponent(recordingId)}`);
  }

  async getWaveform(recordingId: string): Promise<Waveform> {
    return this.http.request<Waveform>(`/recordings/${encodeURIComponent(recordingId)}/waveform`);
  }

  /** Fetch the recorded audio itself as binary (content-type/filename from response headers). */
  async download(recordingId: string): Promise<BinaryResponse> {
    return this.http.request<BinaryResponse>(`/recordings/${encodeURIComponent(recordingId)}`, {
      responseType: 'binary',
      headers: { Accept: 'audio/*, */*' },
    });
  }

  async delete(recordingId: string): Promise<void> {
    await this.http.request<void>(`/recordings/${encodeURIComponent(recordingId)}`, { method: 'DELETE' });
  }

  async updateMetadata(recordingId: string, metadata: Record<string, unknown>): Promise<Recording> {
    return this.http.request<Recording>(`/recordings/${encodeURIComponent(recordingId)}/metadata`, {
      method: 'PUT',
      body: metadata,
    });
  }

  async addTags(recordingId: string, tags: string[]): Promise<Recording> {
    return this.http.request<Recording>(`/recordings/${encodeURIComponent(recordingId)}/tags`, {
      method: 'POST',
      body: { tags },
    });
  }

  async deleteTags(recordingId: string, tags: string[]): Promise<Recording> {
    return this.http.request<Recording>(`/recordings/${encodeURIComponent(recordingId)}/tags`, {
      method: 'DELETE',
      body: { tags },
    });
  }

  /** Multipart upload, step 1: initiate. Same endpoint as {@link create}; the account_id path distinguishes it. */
  async initiateMultipart(accountId: string, data: Record<string, unknown>): Promise<Recording> {
    return this.create(accountId, { ...data, multipart: true });
  }

  /** Multipart upload, step 2: get the target/part URL to PUT audio bytes to. */
  async getUploadTarget(recordingId: string): Promise<UploadTarget> {
    return this.http.request<UploadTarget>(`/recordings/${encodeURIComponent(recordingId)}/upload`);
  }

  /** Multipart upload, step 3: mark the upload complete once all parts are sent. */
  async completeUpload(recordingId: string, data?: Record<string, unknown>): Promise<Recording> {
    return this.http.request<Recording>(`/recordings/${encodeURIComponent(recordingId)}/complete_upload`, {
      method: 'PUT',
      body: data ?? {},
    });
  }
}
