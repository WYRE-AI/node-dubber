import type { TokenCache } from './auth.js';

/**
 * All Dubber API Store products sit behind one Mashery-proxied host,
 * `api.dubber.net`, with an environment segment in the path:
 * `https://api.dubber.net/<region>/v1`. `sandbox` is the free-signup
 * environment (developer.kpn.com-style self-serve); production is
 * region-scoped (confirmed regions: `sandbox`, `us`; the getting-started
 * guide also references an "Australian production environment" without
 * giving its exact segment — verify with Dubber support before assuming
 * `au`). There is deliberately no single production default: shipping
 * against the wrong region silently talks to the wrong tenant's data.
 */
export const DEFAULT_REGION = 'sandbox';
export const API_HOST = 'https://api.dubber.net';

export function baseUrlForRegion(region: string): string {
  const clean = region.trim().replace(/^\/+|\/+$/g, '');
  return `${API_HOST}/${clean}/v1`;
}

/**
 * Password-grant token endpoint, relative to the region base URL (source:
 * Dubber API Getting Started Guide, support.dubber.net). `client_id` /
 * `client_secret` are the Mashery application key/secret issued at
 * developer.kpn.com-style signup on developer.dubber.net; `username` /
 * `password` are NOT a human login — they are the separate "Dubber Auth ID"
 * / "Dubber Auth Token" pair from the Dubber portal's API tab. All four are
 * required; there is no documented client_credentials grant despite the
 * interactive console listing one as an option.
 */
export const TOKEN_PATH = '/token';

export interface DubberConfig {
  /** Mashery application key. */
  clientId: string;
  /** Mashery application secret. */
  clientSecret: string;
  /** Dubber Auth ID (Dubber portal → API tab). Sent as the OAuth `username`. */
  authId: string;
  /** Dubber Auth Token (Dubber portal → API tab). Sent as the OAuth `password`. */
  authToken: string;
  /** Default {@link DEFAULT_REGION} (`sandbox`). Ignored if `baseUrl` is set. */
  region?: string;
  /** Full base URL override. Env mode only — never accept this from a gateway header. */
  baseUrl?: string;
  /** Max retries for network errors, 429s and 5xx — idempotent requests only (default 3). */
  maxRetries?: number;
  /** Token cache override (tests pass a fresh one). Default: the process-wide `defaultTokenCache`. */
  tokenCache?: TokenCache;
}
