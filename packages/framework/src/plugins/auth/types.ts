import type { HAI3App } from '../../types';

// ---------------------------------------------------------------------------
// Core identity
// ---------------------------------------------------------------------------

export interface AuthIdentity {
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Context (carries cancellation signal into every provider call)
// ---------------------------------------------------------------------------

export interface AuthContext {
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Access control
// ---------------------------------------------------------------------------

export interface AccessQuery<TRecord extends Record<string, string | number | boolean | null> = Record<string, string | number | boolean | null>> {
  action: string;
  resource: string;
  record?: TRecord;
}

export type AccessDecision = 'allow' | 'deny';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface AuthLoginInput {
  /** e.g. 'password' | 'oauth' | 'saml' | 'magic-link' */
  type: string;
  payload: Record<string, string | number | boolean | null>;
}

export interface AuthCallbackInput {
  /** Raw query params or hash fragment from the redirect URI */
  params: Record<string, string>;
  /** CSRF / PKCE state token */
  state?: string;
}

// ---------------------------------------------------------------------------
// Results & transitions
// ---------------------------------------------------------------------------

export interface AuthCheckResult {
  authenticated: boolean;
}

export type AuthTransitionType = 'redirect' | 'none';

export interface AuthTransition {
  type: AuthTransitionType;
  /** Plain URL / path — no router semantics */
  redirectUrl?: string;
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export interface AuthPermissions {
  roles?: string[];
  permissions?: string[];
}

// ---------------------------------------------------------------------------
// AuthProvider contract (minimal base)
// ---------------------------------------------------------------------------

export interface AuthProvider<TIdentity extends AuthIdentity = AuthIdentity> {
  login(input: AuthLoginInput, ctx?: AuthContext): Promise<AuthTransition>;
  logout(ctx?: AuthContext): Promise<AuthTransition>;
  handleCallback?(input: AuthCallbackInput, ctx?: AuthContext): Promise<AuthTransition>;
  getIdentity?(ctx?: AuthContext): Promise<TIdentity | null>;
  checkAuth?(ctx?: AuthContext): Promise<AuthCheckResult>;
  getPermissions?(ctx?: AuthContext): Promise<AuthPermissions>;
  canAccess?<TRecord extends Record<string, string | number | boolean | null> = Record<string, string | number | boolean | null>>(
    query: AccessQuery<TRecord>,
    ctx?: AuthContext,
  ): Promise<AccessDecision>;

  onAppInit?(app: HAI3App): void | Promise<void>;
  onAppDestroy?(app: HAI3App): void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Plugin config
// ---------------------------------------------------------------------------

export type AuthPluginConfig<T extends AuthProvider = AuthProvider> = {
  provider: T;
};
