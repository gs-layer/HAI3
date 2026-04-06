import type { AuthCheckResult, AuthIdentity } from '../types';

// ---------------------------------------------------------------------------
// Frontx identity (concrete fields for the frontx provider layer)
// ---------------------------------------------------------------------------

export interface FrontxAuthIdentity extends AuthIdentity {
  id: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  /** Provider-specific claims */
  attributes?: Record<string, string | number | boolean | null>;
}

// ---------------------------------------------------------------------------
// Session types
// ---------------------------------------------------------------------------

/** Bearer token session — Authorization header transport */
export interface BearerAuthSession {
  kind: 'bearer';
  /** Access token (required for bearer) */
  token: string;
  /** Refresh token (if applicable) */
  refreshToken?: string;
  /** Expiry as Unix ms */
  expiresAt?: number;
}

/** Cookie session — withCredentials transport */
export interface CookieAuthSession {
  kind: 'cookie';
  /** CSRF token (if server requires it) */
  csrfToken?: string;
  /** Expiry as Unix ms */
  expiresAt?: number;
}

/** Custom session — provider-defined, no standard transport */
export interface CustomAuthSession {
  kind: 'custom';
  /** Provider-specific data */
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Discriminated union of session types.
 * Narrow by `session.kind` to access kind-specific fields.
 */
export type AuthSession = BearerAuthSession | CookieAuthSession | CustomAuthSession;

// ---------------------------------------------------------------------------
// Check result (extends base with identity + session)
// ---------------------------------------------------------------------------

export interface FrontxAuthCheckResult<
  TIdentity extends AuthIdentity = FrontxAuthIdentity,
> extends AuthCheckResult {
  identity?: TIdentity;
  session?: AuthSession;
}

// ---------------------------------------------------------------------------
// Transport adapter (interfaces only — for future @cyberfabric/api binding)
// ---------------------------------------------------------------------------

export interface AuthTransportRequest {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export interface AuthTransportResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface AuthTransportAdapter {
  request(req: AuthTransportRequest): Promise<AuthTransportResponse>;
}

export interface AuthTransportErrorEvent {
  request: AuthTransportRequest;
  error: Error;
  status?: number;
}

// ---------------------------------------------------------------------------
// Capabilities (optional metadata)
// ---------------------------------------------------------------------------

export interface AuthCapabilities {
  canLogin?: boolean;
  canRefresh?: boolean;
  canLogout?: boolean;
  canCallback?: boolean;
  supportsPermissions?: boolean;
  supportsCanAccess?: boolean;
}

// ---------------------------------------------------------------------------
// State subscription
// ---------------------------------------------------------------------------

export type AuthState = 'authenticated' | 'unauthenticated' | 'loading' | 'error';

export interface AuthStateEvent<TIdentity extends AuthIdentity = FrontxAuthIdentity> {
  state: AuthState;
  session?: AuthSession;
  identity?: TIdentity;
  error?: Error;
}

export type AuthStateListener<TIdentity extends AuthIdentity = FrontxAuthIdentity> =
  (event: AuthStateEvent<TIdentity>) => void;
export type AuthUnsubscribe = () => void;
