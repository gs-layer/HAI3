/**
 * useAuthProvider Hook - Access the AuthProvider from context
 *
 * React Layer: L3
 */

import { useHAI3 } from '../HAI3Context';
import type { AuthProvider } from '@cyberfabric/framework';
import type { ResolvedAuthProvider } from '../types';

/**
 * Get the AuthProvider stored in the HAI3 app context.
 *
 * Returns `undefined` when no auth plugin is configured.
 *
 * When `AppRuntimeExtensions` is augmented with a concrete auth provider
 * type, the return type narrows automatically. You can still pass an
 * explicit generic to override.
 *
 * @returns The configured AuthProvider, or undefined
 *
 * @example
 * ```tsx
 * import { useAuthProvider } from '@cyberfabric/react';
 *
 * const MyComponent = () => {
 *   const authProvider = useAuthProvider();
 *   if (!authProvider) return <div>No auth configured</div>;
 *   // ...
 * };
 * ```
 *
 * @example
 * ```tsx
 * import { useAuthProvider, type FrontxAuthProvider } from '@cyberfabric/react';
 *
 * const provider = useAuthProvider<FrontxAuthProvider>();
 * // provider?.getSession() is now available
 * ```
 */
export function useAuthProvider<
  T extends AuthProvider = ResolvedAuthProvider,
>(): T | undefined {
  const app = useHAI3();
  return app.getAuthProvider?.() as T | undefined;
}
