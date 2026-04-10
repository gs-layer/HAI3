/**
 * Auth State Types
 *
 * Types for auth Redux slices managed by the auth plugin.
 * Defined here in framework to keep a clean separation from layout types.
 */

import type {
  AuthState,
  AuthSession,
  AuthPermissions,
  AuthCapabilities,
} from '@cyberfabric/auth';

// ============================================================================
// Session Meta (token-safe snapshot)
// ============================================================================

/**
 * Session metadata without sensitive tokens.
 * Used when `redux.includeTokens` is false (the default).
 * Consumers who need the actual token should call `app.auth.getSession()`.
 */
export interface AuthSessionMeta {
  kind: AuthSession['kind'];
  expiresAt?: number;
}

/**
 * Type guard: full AuthSession vs meta-only snapshot.
 * For bearer sessions, checks for the `token` field.
 * Cookie and custom sessions have no mandatory sensitive fields.
 */
export function isFullAuthSession(
  session: AuthSession | AuthSessionMeta,
): session is AuthSession {
  return session.kind === 'bearer' ? 'token' in session : true;
}

// ============================================================================
// Slice State Types
// ============================================================================

/** Auth session slice state (key: 'auth/session') */
export interface AuthSessionSliceState {
  /** Current authentication status */
  status: AuthState;
  /** Session data — full or meta depending on includeTokens config */
  session: AuthSession | AuthSessionMeta | null;
  /** Serializable error message */
  error: string | null;
  /** Unix ms timestamp of last successful sync */
  lastSyncAt: number | null;
  /** Provider capabilities (static, set once on init) */
  capabilities: AuthCapabilities | null;
}

/** Auth permissions slice state (key: 'auth/permissions') */
export interface AuthPermissionsSliceState {
  /** Roles and permissions for RBAC */
  permissions: AuthPermissions | null;
  /** Whether permissions are being fetched */
  loading: boolean;
  /** Serializable error message */
  error: string | null;
}

// ============================================================================
// Root State Extension
// ============================================================================

/**
 * Root state with auth slices.
 * Use with `useAppSelector` when auth plugin is registered.
 *
 * @example
 * ```typescript
 * const authSession = useAppSelector(
 *   (state: RootStateWithAuth) => state['auth/session']
 * );
 * ```
 */
export interface RootStateWithAuth {
  'auth/session': AuthSessionSliceState;
  'auth/permissions': AuthPermissionsSliceState;
}
