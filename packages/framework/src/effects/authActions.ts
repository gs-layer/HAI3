/**
 * Auth Actions
 *
 * Pure action functions for auth operations.
 * These emit events that are consumed by authEffects.
 */

import { eventBus } from '@cyberfabric/state';
import { AuthEvents } from './authEffects';
import type { AuthLoginInput } from '@cyberfabric/auth';

/**
 * Force re-check auth state.
 * Triggers checkAuth() + getSession() + getPermissions() flow.
 *
 * @example
 * ```typescript
 * import { syncAuth } from '@cyberfabric/framework';
 * syncAuth();
 * ```
 */
export function syncAuth(): void {
  eventBus.emit(AuthEvents.SyncRequested);
}

/**
 * Trigger login flow via auth provider.
 *
 * @example
 * ```typescript
 * import { loginAction } from '@cyberfabric/framework';
 * loginAction({ type: 'password', payload: { email, password } });
 * ```
 */
export function loginAction(input: AuthLoginInput): void {
  eventBus.emit(AuthEvents.LoginRequested, { input });
}

/**
 * Trigger logout flow via auth provider.
 */
export function logoutAction(): void {
  eventBus.emit(AuthEvents.LogoutRequested);
}

/**
 * Refresh the current session.
 * After refresh completes, triggers a full sync.
 */
export function refreshAuth(): void {
  eventBus.emit(AuthEvents.RefreshRequested);
}

/**
 * Fetch permissions independently.
 * Useful after role changes without re-checking the full session.
 */
export function fetchPermissions(): void {
  eventBus.emit(AuthEvents.PermissionsFetchRequested);
}
