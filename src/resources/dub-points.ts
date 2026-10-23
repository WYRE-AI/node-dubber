import type { HttpClient } from '../http.js';
import type { DubPoint } from '../types/index.js';
import { unwrapList } from '../types/index.js';
import { PaginationLimitError, ValidationError } from '../errors.js';

export interface ListDubPointsParams {
  /** Only this user's dub points (Dubber user id, not a URL). */
  user?: string;
  /** Page size, 1..100 (Dubber default 20). */
  count?: number;
  /** Page number, a non-negative integer. Dubber does not document whether pages are 0- or 1-based. */
  page?: number;
}

/** Collected dub points and the reason pagination stopped. */
export interface ListAllDubPointsResult {
  /** Deduplicated Dub.Points collected before pagination stopped. */
  dubPoints: DubPoint[];
  /** True when results may be incomplete: the request cap or a later full page with no new ids. */
  truncated: boolean;
  /** 'complete': short/empty page; 'limit': request cap; 'no-progress': later full page with no new ids. */
  stopReason: 'complete' | 'limit' | 'no-progress';
  /** Number of list requests made. */
  requests: number;
}

const MAX_COUNT = 100;
const MAX_PAGES = 50;

/** Dub.Point: connects an external telecom system (e.g. BroadWorks) to Dubber recording. */
export class DubPointsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Fetch one page of dub points for an account, optionally filtered by `user` (Dubber user id).
   * `count` is 1..100 (Dubber default 20); `page` is a non-negative integer with an undocumented base.
   * Throws ValidationError for invalid count/page before any request.
   * Use listAll or listAllWithStatus to fetch every page.
   */
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
   * By default (`onLimit: 'return'`), returns collected results even when incomplete.
   * With `onLimit: 'throw'`, throws PaginationLimitError with partial results and a reason for either incomplete stop.
   * Use listAllWithStatus to inspect truncation, stopReason, and the number of requests.
   */
  async listAll(accountId: string, params?: { user?: string; onLimit?: 'return' | 'throw' }): Promise<DubPoint[]> {
    const result = await this.listAllWithStatus(accountId, params);
    if (result.truncated && params?.onLimit === 'throw') {
      const reason = result.stopReason === 'no-progress' ? 'no-progress' : 'limit';
      const message = reason === 'limit'
        ? `listAll stopped at the ${MAX_PAGES}-request pagination limit; more dub points may exist `
        : 'listAll stopped because a later full page returned no new dub points ' +
          '(the server may be ignoring page); results may be incomplete ';
      throw new PaginationLimitError(
        message + `(${result.dubPoints.length} collected). Use listAllWithStatus or narrow with user.`,
        result.dubPoints,
        reason
      );
    }
    return result.dubPoints;
  }

  /**
   * Fetch deduped dub points as in listAll, reporting requests and stopReason.
   * A short/empty page is 'complete'; the 50-request cap is 'limit'; a full page past page=1
   * with no new ids is 'no-progress'. Both 'limit' and 'no-progress' set truncated to true.
   * A repeated page=1 is skipped for compatibility with 1-based paging and does not stop pagination.
   */
  async listAllWithStatus(accountId: string, params?: { user?: string }): Promise<ListAllDubPointsResult> {
    const seen = new Set<string>();
    const all: DubPoint[] = [];
    let requests = 0;
    for (let request = 0; request < MAX_PAGES; request++) {
      const page = await this.list(accountId, {
        user: params?.user,
        count: MAX_COUNT,
        page: request === 0 ? undefined : request,
      });
      requests++;
      let added = 0;
      for (const dp of page) {
        if (seen.has(dp.id)) continue;
        seen.add(dp.id);
        all.push(dp);
        added++;
      }
      if (page.length < MAX_COUNT) {
        return { dubPoints: all, truncated: false, stopReason: 'complete', requests };
      }
      if (added === 0 && request > 1) {
        return { dubPoints: all, truncated: true, stopReason: 'no-progress', requests };
      }
    }
    return { dubPoints: all, truncated: true, stopReason: 'limit', requests };
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
