/**
 * useLogout Hook - Logout callback with redirect handling
 *
 * React Layer: L3
 */

import { useCallback } from 'react';
import { useAuthProvider } from './useAuthProvider';
import type { AuthTransition } from '@cyberfabric/framework';
import type { UseLogoutReturn } from '../types';

/**
 * Get a callback for calling the authProvider.logout() method
 * and optionally redirect on success.
 *
 * @returns Logout callback
 *
 * @example
 * ```tsx
 * import { useLogout } from '@cyberfabric/react';
 *
 * const LogoutButton = () => {
 *   const logout = useLogout();
 *   const handleClick = () => logout();
 *   return <button onClick={handleClick}>Logout</button>;
 * };
 * ```
 *
 * @example
 * ```tsx
 * // Override redirect destination
 * logout('/goodbye');
 * ```
 */
export function useLogout(): UseLogoutReturn {
  const authProvider = useAuthProvider();

  const logout = useCallback(
    (redirectTo?: string): Promise<AuthTransition> => {
      if (!authProvider) {
        throw new Error(
          'useLogout requires an AuthProvider. ' +
          'Add the auth() plugin to your HAI3 app configuration.',
        );
      }

      return authProvider.logout().then((transition) => {
        const target = redirectTo ?? (transition.type === 'redirect' ? transition.redirectUrl : undefined);
        if (target) {
          window.location.href = target;
        }
        return transition;
      });
    },
    [authProvider],
  );

  return logout;
}
