/**
 * Auth Effects
 *
 * Bridges AuthProvider state changes into Redux via the EventBus.
 * Handles session sync, login/logout flows, and permissions fetching.
 *
 * Event-driven architecture: provider pushes state via subscribe(),
 * effects dispatch to auth slices, components read via useAppSelector.
 */

import { eventBus } from '@cyberfabric/state';
import type { AppDispatch } from '@cyberfabric/state';
import type {
  AuthProvider,
  AuthSession,
  AuthState,
  AuthLoginInput,
} from '@cyberfabric/auth';
import {
  setAuthSessionState,
  setAuthLoading,
  setAuthError,
} from '../slices/authSessionSlice';
import {
  setPermissions,
  setPermissionsLoading,
  setPermissionsError,
  clearPermissions,
} from '../slices/authPermissionsSlice';
import type { AuthSessionMeta } from '../authTypes';

// ============================================================================
// Event Constants
// ============================================================================

export const AuthEvents = {
  // Session events
  StateChanged: 'auth/session/state-changed',
  SyncRequested: 'auth/session/sync-requested',
  LoginRequested: 'auth/session/login-requested',
  LogoutRequested: 'auth/session/logout-requested',
  RefreshRequested: 'auth/session/refresh-requested',
  // Permissions events
  PermissionsFetchRequested: 'auth/permissions/fetch-requested',
  PermissionsChanged: 'auth/permissions/changed',
} as const;

// ============================================================================
// Event Payload Types
// ============================================================================

export interface AuthStateChangedPayload {
  state: AuthState;
  session?: AuthSession | AuthSessionMeta;
  error?: string;
}

export interface AuthLoginRequestedPayload {
  input: AuthLoginInput;
}

export interface AuthPermissionsChangedPayload {
  permissions: import('@cyberfabric/auth').AuthPermissions | null;
}

// ============================================================================
// Module Augmentation for Type-Safe Events
// ============================================================================

declare module '@cyberfabric/state' {
  interface EventPayloadMap {
    'auth/session/state-changed': AuthStateChangedPayload; // session may be AuthSession or AuthSessionMeta
    'auth/session/sync-requested': void;
    'auth/session/login-requested': AuthLoginRequestedPayload;
    'auth/session/logout-requested': void;
    'auth/session/refresh-requested': void;
    'auth/permissions/fetch-requested': void;
    'auth/permissions/changed': AuthPermissionsChangedPayload;
  }
}

// ============================================================================
// Token Stripping
// ============================================================================

/**
 * Convert AuthSession to either full session or meta-only snapshot
 * based on the includeTokens configuration.
 */
export function toSessionOrMeta(
  session: AuthSession,
  includeTokens: boolean,
): AuthSession | AuthSessionMeta {
  if (includeTokens) return session;
  const expiresAt = session.kind !== 'custom' ? session.expiresAt : undefined;
  return { kind: session.kind, expiresAt };
}

// ============================================================================
// Effect Initialization
// ============================================================================

/**
 * Initialize auth effects.
 *
 * Called from auth plugin's `onInit` with closure over provider and config.
 * This follows the same pattern as `initMockEffects` and `initMfeEffects`.
 *
 * @returns Cleanup function that unsubscribes all listeners.
 */
export function initAuthEffects(
  dispatch: AppDispatch,
  provider: AuthProvider,
  includeTokens: boolean,
): () => void {

  // --- Provider subscribe() bridge (reactive) ---
  const providerUnsub = provider.subscribe?.((event) => {
    const session = event.session
      ? toSessionOrMeta(event.session, includeTokens)
      : undefined;
    eventBus.emit(AuthEvents.StateChanged, {
      state: event.state,
      session,
      error: event.error?.message,
    });
  });

  // --- state-changed → dispatch to session slice ---
  const subStateChanged = eventBus.on(AuthEvents.StateChanged, (payload) => {
    dispatch(setAuthSessionState({
      status: payload.state,
      session: (payload.session as AuthSession | AuthSessionMeta) ?? null,
      error: payload.error ?? null,
      lastSyncAt: Date.now(),
    }));
  });

  // --- sync-requested → checkAuth + getSession + getPermissions ---
  const subSync = eventBus.on(AuthEvents.SyncRequested, () => {
    dispatch(setAuthLoading());

    void (async () => {
      try {
        const checkResult = await provider.checkAuth();

        if (!checkResult.authenticated) {
          dispatch(setAuthSessionState({
            status: 'unauthenticated',
            session: null,
            error: null,
            lastSyncAt: Date.now(),
          }));
          dispatch(clearPermissions());
          return;
        }

        // Use session from checkAuth result, or fetch separately
        const session = checkResult.session ?? await provider.getSession();
        const sessionForState = session
          ? toSessionOrMeta(session, includeTokens)
          : null;

        dispatch(setAuthSessionState({
          status: 'authenticated',
          session: sessionForState,
          error: null,
          lastSyncAt: Date.now(),
        }));

        // Auto-fetch permissions if provider supports them
        if (provider.getPermissions) {
          dispatch(setPermissionsLoading(true));
          try {
            const permissions = await provider.getPermissions();
            dispatch(setPermissions(permissions));
          } catch (permErr) {
            dispatch(setPermissionsError(
              permErr instanceof Error ? permErr.message : String(permErr),
            ));
          }
        }
      } catch (err) {
        dispatch(setAuthError(
          err instanceof Error ? err.message : String(err),
        ));
      }
    })();
  });

  // --- login-requested → provider.login() → sync ---
  const subLogin = eventBus.on(AuthEvents.LoginRequested, (payload) => {
    if (!provider.login) return;
    dispatch(setAuthLoading());

    void (async () => {
      try {
        await provider.login!(payload.input);
        eventBus.emit(AuthEvents.SyncRequested);
      } catch (err) {
        dispatch(setAuthError(
          err instanceof Error ? err.message : String(err),
        ));
      }
    })();
  });

  // --- logout-requested → provider.logout() → unauthenticated ---
  const subLogout = eventBus.on(AuthEvents.LogoutRequested, () => {
    dispatch(setAuthLoading());

    void (async () => {
      try {
        await provider.logout();
        dispatch(setAuthSessionState({
          status: 'unauthenticated',
          session: null,
          error: null,
          lastSyncAt: Date.now(),
        }));
        dispatch(clearPermissions());
      } catch (err) {
        dispatch(setAuthError(
          err instanceof Error ? err.message : String(err),
        ));
      }
    })();
  });

  // --- refresh-requested → provider.refresh() → sync ---
  const subRefresh = eventBus.on(AuthEvents.RefreshRequested, () => {
    if (!provider.refresh) return;

    void (async () => {
      try {
        await provider.refresh!();
        eventBus.emit(AuthEvents.SyncRequested);
      } catch (err) {
        dispatch(setAuthError(
          err instanceof Error ? err.message : String(err),
        ));
      }
    })();
  });

  // --- permissions/fetch-requested → provider.getPermissions() ---
  const subPermissionsFetch = eventBus.on(AuthEvents.PermissionsFetchRequested, () => {
    if (!provider.getPermissions) return;
    dispatch(setPermissionsLoading(true));

    void (async () => {
      try {
        const permissions = await provider.getPermissions!();
        dispatch(setPermissions(permissions));
      } catch (err) {
        dispatch(setPermissionsError(
          err instanceof Error ? err.message : String(err),
        ));
      }
    })();
  });

  // --- Cleanup ---
  return () => {
    subStateChanged.unsubscribe();
    subSync.unsubscribe();
    subLogin.unsubscribe();
    subLogout.unsubscribe();
    subRefresh.unsubscribe();
    subPermissionsFetch.unsubscribe();
    providerUnsub?.();
  };
}
