/**
 * Entity shapes for the Dubber API. Dubber does not publish a downloadable
 * OpenAPI/JSON-Schema spec (the interactive `/io-docs` console gives request
 * examples, not response schemas), so every interface here types the fields
 * that were actually visible in the console's examples/field lists and
 * leaves everything else open via `[key: string]: unknown` rather than
 * asserting a shape this client can't verify. Treat these as a floor, not a
 * ceiling — widen them from real responses as the fleet exercises this SDK
 * against a live sandbox account.
 */

export interface Group {
  id: string;
  name: string;
  parent_group_id?: string;
  [key: string]: unknown;
}

export interface Account {
  id: string;
  name: string;
  group_id?: string;
  timezone?: string;
  [key: string]: unknown;
}

export interface Recording {
  id: string;
  account_id?: string;
  duration?: number;
  created_at?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  self?: string;
  to?: string;
  from?: string;
  call_type?: string;
  channel?: string;
  status?: string;
  /** RFC 2822, e.g. "Sun, 28 Jul 2013 12:42:10 +1000". */
  start_time?: string;
  end_time?: string;
  date_created?: string;
  date_updated?: string;
  /**
   * Pre-signed, short-lived S3 URL. Only present when `recordings.get` was
   * called with a `listener`. Treat as a secret; never log it.
   */
  recording_url?: string;
  [key: string]: unknown;
}

export interface Waveform {
  recording_id?: string;
  self?: string;
  recording?: string;
  /** Pre-signed S3 URL (short expiry). Treat as a secret; never log it. */
  waveform_url?: string;
  [key: string]: unknown;
}

export interface UploadTarget {
  recording_id?: string;
  upload_url?: string;
  [key: string]: unknown;
}

export interface DubberUser {
  id: string;
  email?: string;
  name?: string;
  role?: string;
  account_id?: string;
  [key: string]: unknown;
}

export interface Profile {
  id?: string;
  email?: string;
  name?: string;
  [key: string]: unknown;
}

export interface Notification {
  id: string;
  url?: string;
  event?: string;
  active?: boolean;
  [key: string]: unknown;
}

export interface DubPoint {
  id: string;
  name?: string;
  account_id?: string;
  self?: string;
  /** e.g. "API" | "Recorder" */
  type?: string;
  label?: string;
  /** URL of the owning user (`.../users/<USER_ID>`), not a bare id. */
  user?: string;
  status?: string;
  product?: string;
  external_type?: string;
  external_identifier?: string;
  date_created?: string;
  date_updated?: string;
  [key: string]: unknown;
}

/** Some Dubber list endpoints may wrap results (`{data: [...]}` / `{items: [...]}`); others return a bare array. */
export function unwrapList<T>(body: unknown, ...wrapperKeys: string[]): T[] {
  if (Array.isArray(body)) return body as T[];
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    for (const key of wrapperKeys) {
      const value = b[key];
      if (Array.isArray(value)) return value as T[];
    }
  }
  return [];
}
