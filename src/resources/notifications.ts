import type { HttpClient } from '../http.js';
import type { Notification } from '../types/index.js';
import { unwrapList } from '../types/index.js';

/** REST-hook (webhook) subscriptions, account-scoped. */
export class NotificationsResource {
  constructor(private readonly http: HttpClient) {}

  async list(accountId: string): Promise<Notification[]> {
    const body = await this.http.request<unknown>(`/accounts/${encodeURIComponent(accountId)}/notifications`);
    return unwrapList<Notification>(body, 'notifications', 'data');
  }

  async create(
    accountId: string,
    data: { url: string; event: string; [key: string]: unknown }
  ): Promise<Notification> {
    return this.http.request<Notification>(`/accounts/${encodeURIComponent(accountId)}/notifications`, {
      method: 'POST',
      body: data,
    });
  }

  async get(notificationId: string): Promise<Notification> {
    return this.http.request<Notification>(`/notifications/${encodeURIComponent(notificationId)}`);
  }

  async update(notificationId: string, data: Record<string, unknown>): Promise<Notification> {
    return this.http.request<Notification>(`/notifications/${encodeURIComponent(notificationId)}`, {
      method: 'PUT',
      body: data,
    });
  }

  /** A newly created rest hook needs an explicit activation step before it fires. */
  async activate(notificationId: string): Promise<Notification> {
    return this.http.request<Notification>(`/notifications/${encodeURIComponent(notificationId)}/activate`, {
      method: 'POST',
    });
  }

  /** Unclaimed/undelivered notification events pending for this subscription. */
  async listUnclaimed(notificationId: string): Promise<unknown[]> {
    const body = await this.http.request<unknown>(
      `/notifications/${encodeURIComponent(notificationId)}/unclaimed`
    );
    return unwrapList<unknown>(body, 'events', 'data');
  }

  async delete(notificationId: string): Promise<void> {
    await this.http.request<void>(`/notifications/${encodeURIComponent(notificationId)}`, {
      method: 'DELETE',
    });
  }
}
