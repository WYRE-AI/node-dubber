import type { HttpClient } from '../http.js';
import type { Group, Recording } from '../types/index.js';
import { unwrapList } from '../types/index.js';

/** Group hierarchy and group-scoped unidentified (unclaimed) recordings. */
export class GroupsResource {
  constructor(private readonly http: HttpClient) {}

  async get(groupId: string): Promise<Group> {
    return this.http.request<Group>(`/groups/${encodeURIComponent(groupId)}`);
  }

  async createChild(groupId: string, data: { name: string; [key: string]: unknown }): Promise<Group> {
    return this.http.request<Group>(`/groups/${encodeURIComponent(groupId)}/groups`, {
      method: 'POST',
      body: data,
    });
  }

  async listUnidentifiedRecordings(groupId: string): Promise<Recording[]> {
    const body = await this.http.request<unknown>(
      `/groups/${encodeURIComponent(groupId)}/unidentified_recordings`
    );
    return unwrapList<Recording>(body, 'recordings', 'data');
  }

  async createUnidentifiedRecording(
    groupId: string,
    data: Record<string, unknown>
  ): Promise<Recording> {
    return this.http.request<Recording>(
      `/groups/${encodeURIComponent(groupId)}/unidentified_recordings`,
      { method: 'POST', body: data }
    );
  }
}
