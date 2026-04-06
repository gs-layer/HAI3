/**
 * useGetIdentity Hook - Fetch current user identity
 *
 * React Layer: L3
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthProvider } from './useAuthProvider';
import type { AuthIdentity } from '@cyberfabric/framework';
import type { ResolvedAuthProvider } from '../types';
import type { UseGetIdentityReturn } from '../types';

/**
 * Extracts the identity type from an AuthProvider.
 * Given `{ getIdentity?(): Promise<T | null> }`, resolves to `T`.
 * Falls back to `AuthIdentity` when `getIdentity` is absent.
 */
type InferIdentity<TProvider> =
  TProvider extends { getIdentity?(...args: never[]): Promise<infer R> }
    ? NonNullable<R>
    : AuthIdentity;

/**
 * Return the current user identity by calling authProvider.getIdentity() on mount.
 *
 * The return value updates according to the call state:
 * - mount: `{ isPending: true, identity: null, error: null }`
 * - success: `{ isPending: false, identity: TIdentity, error: null }`
 * - error: `{ isPending: false, identity: null, error: Error }`
 *
 * When `AppRuntimeExtensions` is augmented with a concrete auth provider
 * type, the identity type is automatically inferred — no explicit generic
 * needed. You can still pass an explicit generic to override.
 *
 * @returns Identity state with refetch capability
 *
 * @example
 * ```tsx
 * import { useGetIdentity } from '@cyberfabric/react';
 *
 * const UserInfo = () => {
 *   const { identity, isPending, error } = useGetIdentity();
 *
 *   if (isPending) return <span>Loading...</span>;
 *   if (error) return <span>Error: {error.message}</span>;
 *   if (!identity) return <span>Not logged in</span>;
 *
 *   return <span>Hello, {identity.name as string}</span>;
 * };
 * ```
 */
export function useGetIdentity<
  TIdentity extends AuthIdentity = InferIdentity<ResolvedAuthProvider>,
>(): UseGetIdentityReturn<TIdentity> {
  const authProvider = useAuthProvider();
  const [identity, setIdentity] = useState<TIdentity | null>(null);
  const [isPending, setIsPending] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [fetchKey, setFetchKey] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!authProvider || typeof authProvider.getIdentity !== 'function') {
      setIdentity(null);
      setIsPending(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsPending(true);
    setError(null);

    authProvider
      .getIdentity()
      .then((result) => {
        if (!cancelled && mountedRef.current) {
          setIdentity(result as TIdentity | null);
          setIsPending(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled && mountedRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIdentity(null);
          setIsPending(false);
        }
      });

    return () => { cancelled = true; };
  }, [authProvider, fetchKey]);

  const refetch = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

  return { identity, isPending, error, refetch };
}
