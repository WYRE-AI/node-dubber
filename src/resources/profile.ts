import type { HttpClient } from '../http.js';
import type { Profile } from '../types/index.js';

export class ProfileResource {
  constructor(private readonly http: HttpClient) {}

  /** The authenticated user/application's own profile. */
  async get(): Promise<Profile> {
    return this.http.request<Profile>('/profile');
  }
}
