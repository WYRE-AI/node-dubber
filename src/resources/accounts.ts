import type { HttpClient } from '../http.js';
import type { Account } from '../types/index.js';

/** Dubber accounts — created under a group, hold recordings and users. */
export class AccountsResource {
  constructor(private readonly http: HttpClient) {}

  /** The Group Methods docs list account creation as `POST /accounts` (unscoped by group in the path). */
  async create(data: { name: string; group_id?: string; timezone?: string; [key: string]: unknown }): Promise<Account> {
    return this.http.request<Account>('/accounts', { method: 'POST', body: data });
  }

  async get(accountId: string): Promise<Account> {
    return this.http.request<Account>(`/accounts/${encodeURIComponent(accountId)}`);
  }

  async update(accountId: string, data: Record<string, unknown>): Promise<Account> {
    return this.http.request<Account>(`/accounts/${encodeURIComponent(accountId)}`, {
      method: 'PUT',
      body: data,
    });
  }
}
