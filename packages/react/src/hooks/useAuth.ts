/**
 * useAuth Hook - Auth state & actions
 *
 * Reads from auth/session and auth/permissions slices.
 * Provides reactive auth state and action dispatchers.
 *
 * Redux is a projection — provider is the source of truth.
 * Use `useAuth()` for React components, `app.auth.getSession()` for imperative code.
 *
 * React Layer: L3
 */

import { useCallback } from 'react';
import { useHAI3 } from '../HAI3Context';
import { useAppSelector } from './useAppSelector';
import type { AuthLoginInput } from '@cyberfabric/auth';
import type { AuthSessionSliceState, AuthPermissionsSliceState } from '@cyberfabric/framework';

/** useAuth() return type */
export interface UseAuthReturn {
  /** Current auth status */
  status: AuthSessionSliceState['status'];
  /** Whether user is authenticated */
  isAuthenticated: boolean;
  /** Whether auth is loading */
  isLoading: boolean;
  /** Session data (tokens may be redacted based on config) */
  session: AuthSessionSliceState['session'];
  /** Error message if any */
  error: AuthSessionSliceState['error'];
  /** Last sync timestamp (Unix ms) */
  lastSyncAt: AuthSessionSliceState['lastSyncAt'];
  /** Provider capabilities (canLogin, canRefresh, etc.) */
  capabilities: AuthSessionSliceState['capabilities'];
  /** Permissions for RBAC */
  permissions: AuthPermissionsSliceState['permissions'];
  /** Whether permissions are being fetched */
  permissionsLoading: AuthPermissionsSliceState['loading'];
  /** Permissions error if any */
  permissionsError: AuthPermissionsSliceState['error'];
  /** Force re-check auth state */
  sync: () => void;
  /** Trigger login flow */
  login: (input: AuthLoginInput) => void;
  /** Trigger logout flow */
  logout: () => void;
  /** Refresh current session */
  refresh: () => void;
  /** Fetch permissions independently */
  fetchPermissions: () => void;
}

/**
 * Hook for auth state and actions.
 *
 * Safe to use even when auth plugin is not registered — returns unauthenticated defaults.
 *
 * @example
 * ```tsx
 * const { isAuthenticated, status, permissions, login, logout } = useAuth();
 *
 * if (!isAuthenticated) {
 *   return <LoginButton onClick={() => login({ type: 'oauth', payload: {} })} />;
 * }
 *
 * return <UserMenu onLogout={logout} roles={permissions?.roles} />;
 * ```
 */
export function useAuth(): UseAuthReturn {
  const app = useHAI3();

  // Safe access: undefined if auth plugin is not registered
  const sessionState = useAppSelector((state) => {
    return (state as Record<string, unknown>)['auth/session'] as AuthSessionSliceState | undefined;
  });

  const permissionsState = useAppSelector((state) => {
    return (state as Record<string, unknown>)['auth/permissions'] as AuthPermissionsSliceState | undefined;
  });

  // Session defaults
  const status = sessionState?.status ?? 'unauthenticated';
  const session = sessionState?.session ?? null;
  const error = sessionState?.error ?? null;
  const lastSyncAt = sessionState?.lastSyncAt ?? null;
  const capabilities = sessionState?.capabilities ?? null;

  // Permissions defaults
  const permissions = permissionsState?.permissions ?? null;
  const permissionsLoading = permissionsState?.loading ?? false;
  const permissionsError = permissionsState?.error ?? null;

  // Action callbacks — auth actions exist at runtime when auth plugin is registered.
  // We use a type cast because HAI3Actions is augmented via module augmentation
  // in the auth plugin, which may not be visible during standalone react package builds.
  const actions = app.actions as unknown as Record<string, ((...args: unknown[]) => void) | undefined>;

  const sync = useCallback(() => {
    (actions.syncAuth as (() => void) | undefined)?.();
  }, [actions]);

  const login = useCallback((input: AuthLoginInput) => {
    (actions.loginAction as ((input: AuthLoginInput) => void) | undefined)?.(input);
  }, [actions]);

  const logout = useCallback(() => {
    (actions.logoutAction as (() => void) | undefined)?.();
  }, [actions]);

  const refresh = useCallback(() => {
    (actions.refreshAuth as (() => void) | undefined)?.();
  }, [actions]);

  const fetchPermissions = useCallback(() => {
    (actions.fetchPermissions as (() => void) | undefined)?.();
  }, [actions]);

  return {
    status,
    isAuthenticated: status === 'authenticated',
    isLoading: status === 'loading',
    session,
    error,
    lastSyncAt,
    capabilities,
    permissions,
    permissionsLoading,
    permissionsError,
    sync,
    login,
    logout,
    refresh,
    fetchPermissions,
  };
}
