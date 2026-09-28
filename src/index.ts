export { DubberClient, type ConnectionTestResult } from './client.js';
export { API_HOST, DEFAULT_REGION, TOKEN_PATH, baseUrlForRegion, type DubberConfig } from './config.js';
export {
  DubberTokenProvider,
  TokenCache,
  defaultTokenCache,
  type AuthProvider,
  type DubberToken,
  type DubberTokenProviderOptions,
} from './auth.js';
export { HttpClient, type HttpClientConfig, type RequestOptions, type BinaryResponse } from './http.js';
export {
  DubberError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  ConflictError,
  RateLimitError,
  ServerError,
  parseDubberError,
} from './errors.js';
export { GroupsResource } from './resources/groups.js';
export { AccountsResource } from './resources/accounts.js';
export { RecordingsResource } from './resources/recordings.js';
export { UsersResource } from './resources/users.js';
export { ProfileResource } from './resources/profile.js';
export { NotificationsResource } from './resources/notifications.js';
export { DubPointsResource } from './resources/dub-points.js';
export { unwrapList } from './types/index.js';
export type * from './types/index.js';
