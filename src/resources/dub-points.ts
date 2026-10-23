import type { HttpClient } from '../http.js';
import type { DubPoint } from '../types/index.js';
import { unwrapList } from '../types/index.js';
import { ValidationError } from '../errors.js';

export interface ListDubPointsParams {
  /** Only this user's dub points (Dubber user id, not a URL). */
  user?: string;
  /** Page size, 1..100 (Dubber default 20). */
  count?: number;
  page?: number;
}

const MAX_COUNT = 100;
const MAX_PAGES = 50;

/** Dub.Point: connects an external telecom system (e.g. BroadWorks) to Dubber recording. */
export class DubPointsResource {
  constructor(private readonly http: HttpClient) {}

  async list(accountId: string, params?: ListDubPointsParams): Promise<DubPoint[]> {
    if (params?.count !== undefined && (!Number.isInteger(params.count) || params.count < 1 || params.count > MAX_COUNT)) {
      throw new ValidationError(`count must be an integer between 1 and ${MAX_COUNT}`, 0, undefined);
    }
    if (params?.page !== undefined && (!Number.isInteger(params.page) || params.page < 0)) {
      throw new ValidationError('page must be a non-negative integer', 0, undefined);
    }
    const body = await this.http.request<unknown>(`/accounts/${encodeURIComponent(accountId)}/dub_points`, {
      params: params && { user: params.user, count: params.count, page: params.page },
    });
    return unwrapList<DubPoint>(body, 'dub_points', 'data');
  }

  /**
   * Fetch every dub point (optionally for one user), count=100 per request.
   *
   * UNCERTAINTY: Dubber documents a `page` param for this endpoint but not
   * whether it is 0- or 1-based. So the first request omits `page` (Dubber's
   * default first page), then we request page=1, 2, 3, ...: if pages are
   * 1-based, page=1 repeats the first page (all ids already seen, skipped by
   * dedupe); if 0-based, page=1 is the genuine second page. Either way page=2
   * onward is correct. Stops on a short/empty page, or a page past page=1
   * yielding no new ids (guards against a server ignoring `page`), with a hard
   * cap of {@link MAX_PAGES} requests. Results are deduped by id.
   */
  async listAll(accountId: string, params?: { user?: string }): Promise<DubPoint[]> {
    const seen = new Set<string>();
    const all: DubPoint[] = [];
    for (let request = 0; request < MAX_PAGES; request++) {
      const page = await this.list(accountId, {
        user: params?.user,
        count: MAX_COUNT,
        page: request === 0 ? undefined : request,
      });
      let added = 0;
      for (const dp of page) {
        if (seen.has(dp.id)) continue;
        seen.add(dp.id);
        all.push(dp);
        added++;
      }
      if (page.length < MAX_COUNT) break;
      if (added === 0 && request > 1) break;
    }
    return all;
  }

  async create(accountId: string, data: Record<string, unknown>): Promise<DubPoint> {
    return this.http.request<DubPoint>(`/accounts/${encodeURIComponent(accountId)}/dub_points`, {
      method: 'POST',
      body: data,
    });
  }

  async get(dubPointId: string): Promise<DubPoint> {
    return this.http.request<DubPoint>(`/dub_points/${encodeURIComponent(dubPointId)}`);
  }

  /** Look up a Dub.Point by external-system identifiers (e.g. a BroadWorks user id). */
  async find(params: Record<string, string>): Promise<DubPoint[]> {
    const body = await this.http.request<unknown>('/dub_points/find', { params });
    return unwrapList<DubPoint>(body, 'dub_points', 'data');
  }
}
