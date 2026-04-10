/**
 * Unit tests for auth Redux integration
 *
 * Covers:
 * 1. toSessionOrMeta — token stripping for all session kinds
 * 2. Auth session slice — reducers
 * 3. Auth permissions slice — reducers
 * 4. Auth actions — event emission
 * 5. Auth effects — sync flow (authenticated/unauthenticated)
 * 6. Auth effects — subscribe() bridge
 * 7. Auth effects — login/logout/refresh flows
 * 8. Auth effects — permissions fetch
 * 9. Auth effects — error handling
 * 10. Auth effects — cleanup
 * 11. Auth effects — provider without subscribe()
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eventBus, createStore, getStore, registerSlice, resetStore } from '@cyberfabric/state';
import type { AuthProvider, AuthSession, AuthPermissions } from '@cyberfabric/auth';
import { authSessionSlice } from '../slices/authSessionSlice';
import { authPermissionsSlice, setPermissions as setPermissionsAction } from '../slices/authPermissionsSlice';
import {
  toSessionOrMeta,
  initAuthEffects,
  AuthEvents,
} from '../effects/authEffects';
import {
  syncAuth,
  loginAction,
  logoutAction,
  refreshAuth,
  fetchPermissions,
} from '../effects/authActions';
import type { AuthSessionSliceState, AuthPermissionsSliceState } from '../authTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Flush all pending microtasks (for fire-and-forget async effects) */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function getAuthSessionState(): AuthSessionSliceState {
  return (getStore().getState() as Record<string, unknown>)['auth/session'] as AuthSessionSliceState;
}

function getAuthPermissionsState(): AuthPermissionsSliceState {
  return (getStore().getState() as Record<string, unknown>)['auth/permissions'] as AuthPermissionsSliceState;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BEARER_SESSION: AuthSession = {
  kind: 'bearer',
  token: 'access-tok-123',
  refreshToken: 'refresh-tok-456',
  expiresAt: Date.now() + 3600_000,
};

const COOKIE_SESSION: AuthSession = {
  kind: 'cookie',
  csrfToken: 'csrf-abc',
  expiresAt: Date.now() + 3600_000,
};

const CUSTOM_SESSION: AuthSession = {
  kind: 'custom',
  myField: 'custom-value',
};

const PERMISSIONS: AuthPermissions = {
  roles: ['admin', 'user'],
  permissions: ['read', 'write'],
};

type SubscribeListener = Parameters<NonNullable<AuthProvider['subscribe']>>[0];

function makeAuthProvider(overrides: Partial<AuthProvider> = {}): AuthProvider {
  return {
    getSession: vi.fn().mockResolvedValue(BEARER_SESSION),
    checkAuth: vi.fn().mockResolvedValue({ authenticated: true, session: BEARER_SESSION }),
    logout: vi.fn().mockResolvedValue({ type: 'none' }),
    ...overrides,
  };
}

function makeAuthProviderWithSubscribe(): {
  provider: AuthProvider;
  emitStateChange: SubscribeListener;
} {
  let listener: SubscribeListener | null = null;

  const provider = makeAuthProvider({
    subscribe: vi.fn((cb: SubscribeListener) => {
      listener = cb;
      return () => { listener = null; };
    }),
  });

  return {
    provider,
    emitStateChange: (event) => {
      if (listener) listener(event);
    },
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe('auth Redux integration', () => {
  beforeEach(() => {
    resetStore();
    createStore({});
    registerSlice(authSessionSlice);
    registerSlice(authPermissionsSlice);
  });

  // =========================================================================
  // 1. toSessionOrMeta
  // =========================================================================
  describe('toSessionOrMeta', () => {
    it('returns full bearer session when includeTokens is true', () => {
      const result = toSessionOrMeta(BEARER_SESSION, true);
      expect(result).toBe(BEARER_SESSION);
    });

    it('strips token and refreshToken from bearer session when includeTokens is false', () => {
      const result = toSessionOrMeta(BEARER_SESSION, false);
      expect(result).toEqual({
        kind: 'bearer',
        expiresAt: BEARER_SESSION.expiresAt,
      });
      expect('token' in result).toBe(false);
      expect('refreshToken' in result).toBe(false);
    });

    it('strips csrfToken from cookie session when includeTokens is false', () => {
      const result = toSessionOrMeta(COOKIE_SESSION, false);
      expect(result).toEqual({
        kind: 'cookie',
        expiresAt: COOKIE_SESSION.expiresAt,
      });
      expect('csrfToken' in result).toBe(false);
    });

    it('returns full cookie session when includeTokens is true', () => {
      const result = toSessionOrMeta(COOKIE_SESSION, true);
      expect(result).toBe(COOKIE_SESSION);
    });

    it('strips custom session fields when includeTokens is false', () => {
      const result = toSessionOrMeta(CUSTOM_SESSION, false);
      expect(result).toEqual({
        kind: 'custom',
        expiresAt: undefined,
      });
      expect('myField' in result).toBe(false);
    });

    it('returns full custom session when includeTokens is true', () => {
      const result = toSessionOrMeta(CUSTOM_SESSION, true);
      expect(result).toBe(CUSTOM_SESSION);
    });
  });

  // =========================================================================
  // 2. Auth session slice reducers
  // =========================================================================
  describe('auth session slice', () => {
    it('has correct initial state', () => {
      const state = getAuthSessionState();
      expect(state).toEqual({
        status: 'loading',
        session: null,
        error: null,
        lastSyncAt: null,
        capabilities: null,
      });
    });
  });

  // =========================================================================
  // 3. Auth permissions slice reducers
  // =========================================================================
  describe('auth permissions slice', () => {
    it('has correct initial state', () => {
      const state = getAuthPermissionsState();
      expect(state).toEqual({
        permissions: null,
        loading: false,
        error: null,
      });
    });
  });

  // =========================================================================
  // 4. Auth actions — event emission
  // =========================================================================
  describe('auth actions', () => {
    it('syncAuth emits sync-requested event', () => {
      const emitSpy = vi.spyOn(eventBus, 'emit');
      syncAuth();
      expect(emitSpy).toHaveBeenCalledWith(AuthEvents.SyncRequested);
      emitSpy.mockRestore();
    });

    it('loginAction emits login-requested with input', () => {
      const emitSpy = vi.spyOn(eventBus, 'emit');
      const input = { type: 'password', payload: { email: 'a@b.com', password: 'x' } };
      loginAction(input);
      expect(emitSpy).toHaveBeenCalledWith(AuthEvents.LoginRequested, { input });
      emitSpy.mockRestore();
    });

    it('logoutAction emits logout-requested event', () => {
      const emitSpy = vi.spyOn(eventBus, 'emit');
      logoutAction();
      expect(emitSpy).toHaveBeenCalledWith(AuthEvents.LogoutRequested);
      emitSpy.mockRestore();
    });

    it('refreshAuth emits refresh-requested event', () => {
      const emitSpy = vi.spyOn(eventBus, 'emit');
      refreshAuth();
      expect(emitSpy).toHaveBeenCalledWith(AuthEvents.RefreshRequested);
      emitSpy.mockRestore();
    });

    it('fetchPermissions emits permissions-fetch-requested event', () => {
      const emitSpy = vi.spyOn(eventBus, 'emit');
      fetchPermissions();
      expect(emitSpy).toHaveBeenCalledWith(AuthEvents.PermissionsFetchRequested);
      emitSpy.mockRestore();
    });
  });

  // =========================================================================
  // 5. Auth effects — sync flow
  // =========================================================================
  describe('sync flow', () => {
    let cleanup: (() => void) | null = null;

    afterEach(() => {
      cleanup?.();
      cleanup = null;
    });

    it('sync-requested with authenticated provider sets authenticated state', async () => {
      const provider = makeAuthProvider({
        getPermissions: vi.fn().mockResolvedValue(PERMISSIONS),
      });
      cleanup = initAuthEffects(getStore().dispatch, provider, false);

      syncAuth();
      await flushMicrotasks();

      const sessionState = getAuthSessionState();
      expect(sessionState.status).toBe('authenticated');
      expect(sessionState.session).toEqual({
        kind: 'bearer',
        expiresAt: BEARER_SESSION.expiresAt,
      });
      expect(sessionState.error).toBeNull();
      expect(sessionState.lastSyncAt).toBeGreaterThan(0);

      const permsState = getAuthPermissionsState();
      expect(permsState.permissions).toEqual(PERMISSIONS);
      expect(permsState.loading).toBe(false);
    });

    it('sync-requested with includeTokens=true preserves full session', async () => {
      const provider = makeAuthProvider();
      cleanup = initAuthEffects(getStore().dispatch, provider, true);

      syncAuth();
      await flushMicrotasks();

      const state = getAuthSessionState();
      expect(state.session).toEqual(BEARER_SESSION);
      expect((state.session as AuthSession & { token: string }).token).toBe('access-tok-123');
    });

    it('sync-requested with unauthenticated provider sets unauthenticated', async () => {
      const provider = makeAuthProvider({
        checkAuth: vi.fn().mockResolvedValue({ authenticated: false }),
      });
      cleanup = initAuthEffects(getStore().dispatch, provider, false);

      syncAuth();
      await flushMicrotasks();

      const sessionState = getAuthSessionState();
      expect(sessionState.status).toBe('unauthenticated');
      expect(sessionState.session).toBeNull();
    });

    it('sync clears permissions when unauthenticated', async () => {
      // Pre-populate permissions
      getStore().dispatch(
        setPermissionsAction(PERMISSIONS),
      );
      expect(getAuthPermissionsState().permissions).toEqual(PERMISSIONS);

      const provider = makeAuthProvider({
        checkAuth: vi.fn().mockResolvedValue({ authenticated: false }),
      });
      cleanup = initAuthEffects(getStore().dispatch, provider, false);

      syncAuth();
      await flushMicrotasks();

      expect(getAuthPermissionsState().permissions).toBeNull();
    });

    it('sync falls back to getSession when checkAuth returns no session', async () => {
      const provider = makeAuthProvider({
        checkAuth: vi.fn().mockResolvedValue({ authenticated: true }),
        getSession: vi.fn().mockResolvedValue(COOKIE_SESSION),
      });
      cleanup = initAuthEffects(getStore().dispatch, provider, false);

      syncAuth();
      await flushMicrotasks();

      const state = getAuthSessionState();
      expect(state.status).toBe('authenticated');
      expect(state.session).toEqual({
        kind: 'cookie',
        expiresAt: COOKIE_SESSION.expiresAt,
      });
      expect(provider.getSession).toHaveBeenCalled();
    });

    it('sync without getPermissions does not fetch permissions', async () => {
      const provider = makeAuthProvider(); // no getPermissions
      cleanup = initAuthEffects(getStore().dispatch, provider, false);

      syncAuth();
      await flushMicrotasks();

      const permsState = getAuthPermissionsState();
      expect(permsState.permissions).toBeNull();
      expect(permsState.loading).toBe(false);
    });
  });

  // =========================================================================
  // 6. Auth effects — subscribe() bridge
  // =========================================================================
  describe('subscribe bridge', () => {
    let cleanup: (() => void) | null = null;

    afterEach(() => {
      cleanup?.();
      cleanup = null;
    });

    it('provider subscribe event updates session slice via EventBus', async () => {
      const { provider, emitStateChange } = makeAuthProviderWithSubscribe();
      cleanup = initAuthEffects(getStore().dispatch, provider, false);

      emitStateChange({
        state: 'authenticated',
        session: BEARER_SESSION,
      });

      // subscribe bridge is synchronous → EventBus → dispatch
      const state = getAuthSessionState();
      expect(state.status).toBe('authenticated');
      expect(state.session).toEqual({
        kind: 'bearer',
        expiresAt: BEARER_SESSION.expiresAt,
      });
      expect('token' in (state.session ?? {})).toBe(false);
    });

    it('provider error event sets error in session slice', () => {
      const { provider, emitStateChange } = makeAuthProviderWithSubscribe();
      cleanup = initAuthEffects(getStore().dispatch, provider, false);

      emitStateChange({
        state: 'error',
        error: new Error('Token expired'),
      });

      const state = getAuthSessionState();
      expect(state.status).toBe('error');
      expect(state.error).toBe('Token expired');
    });

    it('subscribe with includeTokens=true preserves tokens', () => {
      const { provider, emitStateChange } = makeAuthProviderWithSubscribe();
      cleanup = initAuthEffects(getStore().dispatch, provider, true);

      emitStateChange({
        state: 'authenticated',
        session: BEARER_SESSION,
      });

      const state = getAuthSessionState();
      expect((state.session as AuthSession & { token: string }).token).toBe('access-tok-123');
    });
  });

  // =========================================================================
  // 7. Auth effects — login/logout/refresh
  // =========================================================================
  describe('login flow', () => {
    let cleanup: (() => void) | null = null;

    afterEach(() => {
      cleanup?.();
      cleanup = null;
    });

    it('login-requested calls provider.login and triggers sync', async () => {
      const provider = makeAuthProvider({
        login: vi.fn().mockResolvedValue({ type: 'none' }),
      });
      cleanup = initAuthEffects(getStore().dispatch, provider, false);

      loginAction({ type: 'password', payload: { email: 'a@b.com', password: 'x' } });
      await flushMicrotasks();

      expect(provider.login).toHaveBeenCalledWith({
        type: 'password',
        payload: { email: 'a@b.com', password: 'x' },
      });
      // After login, syncAuth is emitted → checkAuth called
      expect(provider.checkAuth).toHaveBeenCalled();
    });

    it('login-requested is no-op when provider has no login method', async () => {
      const provider = makeAuthProvider(); // no login
      cleanup = initAuthEffects(getStore().dispatch, provider, false);

      loginAction({ type: 'password', payload: {} });
      await flushMicrotasks();

      // Should not change state from initial
      expect(getAuthSessionState().status).toBe('loading');
    });
  });

  describe('logout flow', () => {
    let cleanup: (() => void) | null = null;

    afterEach(() => {
      cleanup?.();
      cleanup = null;
    });

    it('logout-requested calls provider.logout and sets unauthenticated', async () => {
      const provider = makeAuthProvider();
      cleanup = initAuthEffects(getStore().dispatch, provider, false);

      // First sync to set authenticated
      syncAuth();
      await flushMicrotasks();
      expect(getAuthSessionState().status).toBe('authenticated');

      logoutAction();
      await flushMicrotasks();

      expect(provider.logout).toHaveBeenCalled();
      expect(getAuthSessionState().status).toBe('unauthenticated');
      expect(getAuthSessionState().session).toBeNull();
    });

    it('logout clears permissions', async () => {
      const provider = makeAuthProvider({
        getPermissions: vi.fn().mockResolvedValue(PERMISSIONS),
      });
      cleanup = initAuthEffects(getStore().dispatch, provider, false);

      syncAuth();
      await flushMicrotasks();
      expect(getAuthPermissionsState().permissions).toEqual(PERMISSIONS);

      logoutAction();
      await flushMicrotasks();

      expect(getAuthPermissionsState().permissions).toBeNull();
    });
  });

  describe('refresh flow', () => {
    let cleanup: (() => void) | null = null;

    afterEach(() => {
      cleanup?.();
      cleanup = null;
    });

    it('refresh-requested calls provider.refresh and triggers sync', async () => {
      const provider = makeAuthProvider({
        refresh: vi.fn().mockResolvedValue({ ...BEARER_SESSION, token: 'new-tok' }),
      });
      cleanup = initAuthEffects(getStore().dispatch, provider, false);

      refreshAuth();
      await flushMicrotasks();

      expect(provider.refresh).toHaveBeenCalled();
      // After refresh, sync is triggered
      expect(provider.checkAuth).toHaveBeenCalled();
    });

    it('refresh-requested is no-op when provider has no refresh method', async () => {
      const provider = makeAuthProvider(); // no refresh
      cleanup = initAuthEffects(getStore().dispatch, provider, false);

      refreshAuth();
      await flushMicrotasks();

      // Should not change state from initial loading
      expect(getAuthSessionState().status).toBe('loading');
    });
  });

  // =========================================================================
  // 8. Auth effects — permissions fetch
  // =========================================================================
  describe('permissions fetch', () => {
    let cleanup: (() => void) | null = null;

    afterEach(() => {
      cleanup?.();
      cleanup = null;
    });

    it('fetch-requested calls provider.getPermissions and updates state', async () => {
      const provider = makeAuthProvider({
        getPermissions: vi.fn().mockResolvedValue(PERMISSIONS),
      });
      cleanup = initAuthEffects(getStore().dispatch, provider, false);

      fetchPermissions();
      await flushMicrotasks();

      expect(provider.getPermissions).toHaveBeenCalled();
      const state = getAuthPermissionsState();
      expect(state.permissions).toEqual(PERMISSIONS);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('fetch-requested is no-op when provider has no getPermissions', async () => {
      const provider = makeAuthProvider(); // no getPermissions
      cleanup = initAuthEffects(getStore().dispatch, provider, false);

      fetchPermissions();
      await flushMicrotasks();

      expect(getAuthPermissionsState().permissions).toBeNull();
    });

    it('permissions fetch error sets error state', async () => {
      const provider = makeAuthProvider({
        getPermissions: vi.fn().mockRejectedValue(new Error('Forbidden')),
      });
      cleanup = initAuthEffects(getStore().dispatch, provider, false);

      fetchPermissions();
      await flushMicrotasks();

      const state = getAuthPermissionsState();
      expect(state.error).toBe('Forbidden');
      expect(state.loading).toBe(false);
    });
  });

  // =========================================================================
  // 9. Auth effects — error handling
  // =========================================================================
  describe('error handling', () => {
    let cleanup: (() => void) | null = null;

    afterEach(() => {
      cleanup?.();
      cleanup = null;
    });

    it('checkAuth error sets error state with serialized message', async () => {
      const provider = makeAuthProvider({
        checkAuth: vi.fn().mockRejectedValue(new Error('Network timeout')),
      });
      cleanup = initAuthEffects(getStore().dispatch, provider, false);

      syncAuth();
      await flushMicrotasks();

      const state = getAuthSessionState();
      expect(state.status).toBe('error');
      expect(state.error).toBe('Network timeout');
    });

    it('non-Error throw is serialized via String()', async () => {
      const provider = makeAuthProvider({
        checkAuth: vi.fn().mockRejectedValue('raw string error'),
      });
      cleanup = initAuthEffects(getStore().dispatch, provider, false);

      syncAuth();
      await flushMicrotasks();

      expect(getAuthSessionState().error).toBe('raw string error');
    });

    it('login error sets error state', async () => {
      const provider = makeAuthProvider({
        login: vi.fn().mockRejectedValue(new Error('Invalid credentials')),
      });
      cleanup = initAuthEffects(getStore().dispatch, provider, false);

      loginAction({ type: 'password', payload: {} });
      await flushMicrotasks();

      expect(getAuthSessionState().status).toBe('error');
      expect(getAuthSessionState().error).toBe('Invalid credentials');
    });

    it('logout error sets error state', async () => {
      const provider = makeAuthProvider({
        logout: vi.fn().mockRejectedValue(new Error('Logout failed')),
      });
      cleanup = initAuthEffects(getStore().dispatch, provider, false);

      logoutAction();
      await flushMicrotasks();

      expect(getAuthSessionState().status).toBe('error');
      expect(getAuthSessionState().error).toBe('Logout failed');
    });

    it('refresh error sets error state', async () => {
      const provider = makeAuthProvider({
        refresh: vi.fn().mockRejectedValue(new Error('Refresh denied')),
      });
      cleanup = initAuthEffects(getStore().dispatch, provider, false);

      refreshAuth();
      await flushMicrotasks();

      expect(getAuthSessionState().status).toBe('error');
      expect(getAuthSessionState().error).toBe('Refresh denied');
    });
  });

  // =========================================================================
  // 10. Auth effects — cleanup
  // =========================================================================
  describe('cleanup', () => {
    it('cleanup unsubscribes all EventBus listeners', async () => {
      const provider = makeAuthProvider();
      const cleanup = initAuthEffects(getStore().dispatch, provider, false);

      cleanup();

      // Events should no longer trigger dispatches
      syncAuth();
      await flushMicrotasks();

      // State should remain at initial (loading) since effects are cleaned up
      expect(getAuthSessionState().status).toBe('loading');
      expect(provider.checkAuth).not.toHaveBeenCalled();
    });

    it('cleanup calls provider unsubscribe', () => {
      const unsubFn = vi.fn();
      const provider = makeAuthProvider({
        subscribe: vi.fn(() => unsubFn),
      });

      const cleanup = initAuthEffects(getStore().dispatch, provider, false);
      expect(unsubFn).not.toHaveBeenCalled();

      cleanup();
      expect(unsubFn).toHaveBeenCalledOnce();
    });
  });

  // =========================================================================
  // 11. Provider without subscribe()
  // =========================================================================
  describe('provider without subscribe()', () => {
    let cleanup: (() => void) | null = null;

    afterEach(() => {
      cleanup?.();
      cleanup = null;
    });

    it('effects still work via imperative actions', async () => {
      const provider = makeAuthProvider(); // no subscribe
      cleanup = initAuthEffects(getStore().dispatch, provider, false);

      syncAuth();
      await flushMicrotasks();

      expect(getAuthSessionState().status).toBe('authenticated');
    });

    it('provider.subscribe is not called', () => {
      const provider = makeAuthProvider(); // no subscribe
      cleanup = initAuthEffects(getStore().dispatch, provider, false);

      expect(provider.subscribe).toBeUndefined();
    });
  });
});
