import type { HttpClient } from '../http.js';
import type { DubPoint } from '../types/index.js';
import { unwrapList } from '../types/index.js';

/** Dub.Point: connects an external telecom system (e.g. BroadWorks) to Dubber recording. */
export class DubPointsResource {
  constructor(private readonly http: HttpClient) {}

  async list(accountId: string): Promise<DubPoint[]> {
    const body = await this.http.request<unknown>(`/accounts/${encodeURIComponent(accountId)}/dub_points`);
    return unwrapList<DubPoint>(body, 'dub_points', 'data');
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
