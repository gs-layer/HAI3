/**
 * useLogin Hook - Login callback with redirect handling
 *
 * React Layer: L3
 */

import { useCallback } from 'react';
import { useAuthProvider } from './useAuthProvider';
import type { AuthLoginInput, AuthTransition } from '@cyberfabric/framework';
import type { UseLoginReturn } from '../types';

/**
 * Get a callback for calling the authProvider.login() method
 * and optionally redirect on success.
 *
 * @returns Login callback
 *
 * @example
 * ```tsx
 * import { useLogin } from '@cyberfabric/react';
 *
 * const LoginButton = () => {
 *   const login = useLogin();
 *
 *   const handleClick = () => {
 *     login({ type: 'password', payload: { username: 'john', password: 's3cr3t' } })
 *       .catch((err) => console.error(err));
 *   };
 *
 *   return <button onClick={handleClick}>Login</button>;
 * };
 * ```
 *
 * @example
 * ```tsx
 * // Override redirect destination
 * login(
 *   { type: 'password', payload: { username: 'john', password: 's3cr3t' } },
 *   '/dashboard',
 * );
 * ```
 */
export function useLogin(): UseLoginReturn {
  const authProvider = useAuthProvider();

  const login = useCallback(
    (input: AuthLoginInput, redirectTo?: string): Promise<AuthTransition> => {
      if (!authProvider) {
        throw new Error(
          'useLogin requires an AuthProvider. ' +
          'Add the auth() plugin to your HAI3 app configuration.',
        );
      }

      return authProvider.login(input).then((transition) => {
        const target = redirectTo ?? (transition.type === 'redirect' ? transition.redirectUrl : undefined);
        if (target) {
          window.location.href = target;
        }
        return transition;
      });
    },
    [authProvider],
  );

  return login;
}
