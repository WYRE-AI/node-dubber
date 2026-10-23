import type { HttpClient } from '../http.js';
import type { BinaryResponse } from '../http.js';
import type { Recording, UploadTarget, Waveform } from '../types/index.js';
import { unwrapList } from '../types/index.js';
import { ValidationError } from '../errors.js';

export interface GetRecordingParams {
  /** Email of a Dubber user with access to the recording; makes Dubber return a pre-signed `recording_url`. */
  listener?: string;
  /** `inline`, `attachment`, or `attachment;filename=<name>.mp3`. */
  content_disposition?: string;
  /** camelCase alias of `content_disposition`; the wire name is always sent. */
  contentDisposition?: string;
}

const CONTENT_DISPOSITION_RE = /^(inline|attachment|attachment;filename=[^;\r\n"\\/]+\.mp3)$/;

/**
 * Call recordings: single-shot upload, retrieval, metadata/tags, waveform,
 * and the multipart large-file variant (initiate → get upload target →
 * complete).
 */
export class RecordingsResource {
  constructor(private readonly http: HttpClient) {}

  async list(accountId: string, params?: { limit?: number; offset?: number }): Promise<Recording[]> {
    const body = await this.http.request<unknown>(`/accounts/${encodeURIComponent(accountId)}/recordings`, {
      params,
    });
    return unwrapList<Recording>(body, 'recordings', 'data');
  }

  /** Single-shot recording upload/creation. */
  async create(accountId: string, data: Record<string, unknown>): Promise<Recording> {
    return this.http.request<Recording>(`/accounts/${encodeURIComponent(accountId)}/recordings`, {
      method: 'POST',
      body: data,
    });
  }

  /**
   * Fetch recording details. With `listener` the response also carries
   * `recording_url`, a short-lived pre-signed S3 URL (a secret: don't log it).
   */
  async get(recordingId: string, params?: GetRecordingParams): Promise<Recording> {
    const disposition = params?.content_disposition ?? params?.contentDisposition;
    if (disposition !== undefined && !CONTENT_DISPOSITION_RE.test(disposition)) {
      throw new ValidationError(
        'content_disposition must be "inline", "attachment", or "attachment;filename=<name>.mp3"',
        0,
        undefined
      );
    }
    const query = { listener: params?.listener, content_disposition: disposition };
    return this.http.request<Recording>(`/recordings/${encodeURIComponent(recordingId)}`, { params: query });
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
