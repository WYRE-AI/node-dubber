import type { HttpClient } from '../http.js';
import type { DubberUser } from '../types/index.js';
import { unwrapList } from '../types/index.js';

export class UsersResource {
  constructor(private readonly http: HttpClient) {}

  async list(accountId: string): Promise<DubberUser[]> {
    const body = await this.http.request<unknown>(`/accounts/${encodeURIComponent(accountId)}/users`);
    return unwrapList<DubberUser>(body, 'users', 'data');
  }

  async create(accountId: string, data: { email: string; name?: string; [key: string]: unknown }): Promise<DubberUser> {
    return this.http.request<DubberUser>(`/accounts/${encodeURIComponent(accountId)}/users`, {
      method: 'POST',
      body: data,
    });
  }

  async get(userId: string): Promise<DubberUser> {
    return this.http.request<DubberUser>(`/users/${encodeURIComponent(userId)}`);
  }

  async update(userId: string, data: Record<string, unknown>): Promise<DubberUser> {
    return this.http.request<DubberUser>(`/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      body: data,
    });
  }

  async delete(userId: string): Promise<void> {
    await this.http.request<void>(`/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
  }
}
