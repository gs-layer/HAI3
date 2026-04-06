/**
 * Unit tests for auth plugin
 *
 * Covers:
 * 1. Bearer header attached when provider session is bearer token.
 * 2. Cookie-session credentials enabled only for relative URLs and allowlisted origins.
 * 3. Refresh+retry on 401: calls ctx.retry once with new Authorization.
 * 4. app.getAuthProvider() exposes the configured AuthProvider.
 * 5. CSRF header attached when csrfHeaderName + session.csrfToken are set.
 * 6. provider.onTransportError invoked on every transport error.
 * 7. Cookie session refresh path: retry without header override.
 * 8. Refresh dedup: concurrent 401s share a single in-flight refresh promise.
 * 9. provider.destroy() called on app.destroy().
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiRegistry } from '@cyberfabric/api';
import { createStore } from '@cyberfabric/state';
import type { RestRequestContext } from '@cyberfabric/api';
import { auth, FrontxAuthRestPlugin, type AuthSession, type FrontxAuthProvider } from '../plugins/auth';
import { createHAI3 } from '../createHAI3';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const noopTransition = { type: 'none' as const };

function makeBearerProvider(
  token: string,
  refresh?: FrontxAuthProvider['refresh'],
): FrontxAuthProvider {
  return {
    login: vi.fn().mockResolvedValue(noopTransition),
    logout: vi.fn().mockResolvedValue(noopTransition),
    handleCallback: vi.fn().mockResolvedValue(noopTransition),
    getIdentity: vi.fn().mockResolvedValue(null),
    getSession: vi.fn().mockResolvedValue({ kind: 'bearer', token } satisfies AuthSession),
    checkAuth: vi.fn().mockResolvedValue({ authenticated: true }),
    ...(refresh ? { refresh } : {}),
  };
}

function makeCookieProvider(): FrontxAuthProvider {
  return {
    login: vi.fn().mockResolvedValue(noopTransition),
    logout: vi.fn().mockResolvedValue(noopTransition),
    handleCallback: vi.fn().mockResolvedValue(noopTransition),
    getIdentity: vi.fn().mockResolvedValue(null),
    getSession: vi.fn().mockResolvedValue({ kind: 'cookie' } satisfies AuthSession),
    checkAuth: vi.fn().mockResolvedValue({ authenticated: true }),
  };
}

function makeNullSessionProvider(): FrontxAuthProvider {
  return {
    login: vi.fn().mockResolvedValue(noopTransition),
    logout: vi.fn().mockResolvedValue(noopTransition),
    handleCallback: vi.fn().mockResolvedValue(noopTransition),
    getIdentity: vi.fn().mockResolvedValue(null),
    getSession: vi.fn().mockResolvedValue(null),
    checkAuth: vi.fn().mockResolvedValue({ authenticated: false }),
  };
}

/** Build a FrontxAuthRestPlugin wired to the given provider's hooks. */
function capturePlugin(
  provider: FrontxAuthProvider,
  opts?: { allowedCookieOrigins?: string[]; csrfHeaderName?: string },
): FrontxAuthRestPlugin {
  return new FrontxAuthRestPlugin({
    getSession: provider.getSession.bind(provider),
    refresh: provider.refresh?.bind(provider),
    onTransportError: provider.onTransportError?.bind(provider),
    allowedCookieOrigins: opts?.allowedCookieOrigins,
    csrfHeaderName: opts?.csrfHeaderName,
  });
}

function makeReqCtx(url: string, headers: Record<string, string> = {}): RestRequestContext {
  return { method: 'GET', url, headers };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('auth plugin', () => {
  beforeEach(() => {
    apiRegistry.reset();
    createStore({});
  });

  afterEach(() => {
    apiRegistry.reset();
  });

  // -------------------------------------------------------------------------
  // 1. Bearer header
  // -------------------------------------------------------------------------
  describe('bearer session', () => {
    it('attaches Authorization: Bearer header when provider returns bearer token', async () => {
      const plugin = capturePlugin(makeBearerProvider('tok-abc'));

      const result = (await plugin.onRequest(makeReqCtx('/api'))) as RestRequestContext;

      expect(result.headers['Authorization']).toBe('Bearer tok-abc');
    });

    it('passes through unmodified when session is null', async () => {
      const plugin = capturePlugin(makeNullSessionProvider());
      const ctx = makeReqCtx('/api');

      const result = (await plugin.onRequest(ctx)) as RestRequestContext;

      expect(result.headers['Authorization']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 2. Cookie-session credentials
  // -------------------------------------------------------------------------
  describe('cookie session credentials', () => {
    it('sets withCredentials=true for relative URLs', async () => {
      const plugin = capturePlugin(makeCookieProvider());

      const result = (await plugin.onRequest(makeReqCtx('/relative/path'))) as RestRequestContext;

      expect(result.withCredentials).toBe(true);
    });

    it('does NOT set withCredentials for absolute URLs not in allowlist', async () => {
      const plugin = capturePlugin(makeCookieProvider(), {
        allowedCookieOrigins: ['https://trusted.example.com'],
      });

      const result = (await plugin.onRequest(
        makeReqCtx('https://other.example.com/api'),
      )) as RestRequestContext;

      expect(result.withCredentials).toBeFalsy();
    });

    it('sets withCredentials=true for absolute URLs from allowlisted origins', async () => {
      const plugin = capturePlugin(makeCookieProvider(), {
        allowedCookieOrigins: ['https://trusted.example.com'],
      });

      const result = (await plugin.onRequest(
        makeReqCtx('https://trusted.example.com/api'),
      )) as RestRequestContext;

      expect(result.withCredentials).toBe(true);
    });

    // -----------------------------------------------------------------------
    // 5. CSRF header
    // -----------------------------------------------------------------------
    it('attaches csrfHeaderName header when csrfHeaderName is configured and session has csrfToken', async () => {
      const provider: FrontxAuthProvider = {
        login: vi.fn().mockResolvedValue(noopTransition),
        logout: vi.fn().mockResolvedValue(noopTransition),
        handleCallback: vi.fn().mockResolvedValue(noopTransition),
        getIdentity: vi.fn().mockResolvedValue(null),
        getSession: vi.fn().mockResolvedValue({ kind: 'cookie', csrfToken: 'csrf-abc' } satisfies AuthSession),
        checkAuth: vi.fn().mockResolvedValue({ authenticated: true }),
      };
      const plugin = capturePlugin(provider, { csrfHeaderName: 'X-CSRF-Token' });

      const result = (await plugin.onRequest(makeReqCtx('/api'))) as RestRequestContext;

      expect(result.withCredentials).toBe(true);
      expect(result.headers['X-CSRF-Token']).toBe('csrf-abc');
    });

    it('does not attach csrf header when csrfToken is absent', async () => {
      const plugin = capturePlugin(makeCookieProvider(), { csrfHeaderName: 'X-CSRF-Token' });

      const result = (await plugin.onRequest(makeReqCtx('/api'))) as RestRequestContext;

      expect(result.withCredentials).toBe(true);
      expect(result.headers['X-CSRF-Token']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 3. 401 refresh + retry
  // -------------------------------------------------------------------------
  describe('401 refresh and retry', () => {
    it('calls provider.refresh then ctx.retry with new token on 401 (retryCount=0)', async () => {
      const refreshFn = vi.fn().mockResolvedValue({ kind: 'bearer', token: 'new-tok' } satisfies AuthSession);
      const plugin = capturePlugin(makeBearerProvider('old-tok', refreshFn));

      const errCtx = {
        error: new Error('HTTP 401'),
        request: makeReqCtx('/api'),
        response: { status: 401, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn().mockResolvedValue({ status: 200, headers: {}, data: {} }),
      };

      await plugin.onError(errCtx);

      expect(refreshFn).toHaveBeenCalledTimes(1);
      expect(errCtx.retry).toHaveBeenCalledWith({ headers: { Authorization: 'Bearer new-tok' } });
    });

    it('returns error without retry on 401 when retryCount > 0', async () => {
      const refreshFn = vi.fn().mockResolvedValue({ kind: 'bearer', token: 'new-tok' } satisfies AuthSession);
      const plugin = capturePlugin(makeBearerProvider('old-tok', refreshFn));

      const errCtx = {
        error: new Error('HTTP 401'),
        request: makeReqCtx('/api'),
        response: { status: 401, headers: {}, data: null },
        retryCount: 1,
        retry: vi.fn(),
      };

      const result = await plugin.onError(errCtx);

      expect(errCtx.retry).not.toHaveBeenCalled();
      expect(result).toBe(errCtx.error);
    });

    it('returns error without retry for non-401 status', async () => {
      const refreshFn = vi.fn().mockResolvedValue({ kind: 'bearer', token: 'new-tok' } satisfies AuthSession);
      const plugin = capturePlugin(makeBearerProvider('old-tok', refreshFn));

      const errCtx = {
        error: new Error('HTTP 500'),
        request: makeReqCtx('/api'),
        response: { status: 500, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn(),
      };

      const result = await plugin.onError(errCtx);

      expect(errCtx.retry).not.toHaveBeenCalled();
      expect(result).toBe(errCtx.error);
    });

    it('returns error when provider has no refresh method', async () => {
      const plugin = capturePlugin(makeBearerProvider('tok')); // no refresh

      const errCtx = {
        error: new Error('HTTP 401'),
        request: makeReqCtx('/api'),
        response: { status: 401, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn(),
      };

      const result = await plugin.onError(errCtx);

      expect(errCtx.retry).not.toHaveBeenCalled();
      expect(result).toBe(errCtx.error);
    });

    // -----------------------------------------------------------------------
    // 7. Cookie session refresh path
    // -----------------------------------------------------------------------
    it('calls provider.refresh and retries without header override on 401 with cookie session', async () => {
      const refreshFn = vi.fn().mockResolvedValue({ kind: 'cookie' } satisfies AuthSession);
      const provider: FrontxAuthProvider = {
        login: vi.fn().mockResolvedValue(noopTransition),
        logout: vi.fn().mockResolvedValue(noopTransition),
        handleCallback: vi.fn().mockResolvedValue(noopTransition),
        getIdentity: vi.fn().mockResolvedValue(null),
        getSession: vi.fn().mockResolvedValue({ kind: 'cookie' } satisfies AuthSession),
        checkAuth: vi.fn().mockResolvedValue({ authenticated: true }),
        refresh: refreshFn,
      };
      const plugin = capturePlugin(provider);

      const errCtx = {
        error: new Error('HTTP 401'),
        request: makeReqCtx('/api'),
        response: { status: 401, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn().mockResolvedValue({ status: 200, headers: {}, data: {} }),
      };

      await plugin.onError(errCtx);

      expect(refreshFn).toHaveBeenCalledTimes(1);
      expect(errCtx.retry).toHaveBeenCalledTimes(1);
      // Cookie retry must not inject any Authorization header
      expect(errCtx.retry).toHaveBeenCalledWith();
    });

    // -----------------------------------------------------------------------
    // 8. Refresh dedup
    // -----------------------------------------------------------------------
    it('deduplicates concurrent 401 refresh calls into a single in-flight promise', async () => {
      let resolveRefresh!: (value: AuthSession) => void;
      const pendingRefresh = new Promise<AuthSession>((resolve) => {
        resolveRefresh = resolve;
      });
      const refreshFn = vi.fn().mockReturnValue(pendingRefresh);
      const plugin = capturePlugin(makeBearerProvider('old-tok', refreshFn));

      const makeErrCtx = () => ({
        error: new Error('HTTP 401'),
        request: makeReqCtx('/api'),
        response: { status: 401, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn().mockResolvedValue({ status: 200, headers: {}, data: {} }),
      });

      const errCtx1 = makeErrCtx();
      const errCtx2 = makeErrCtx();

      // Start both concurrently before resolving refresh
      const p1 = plugin.onError(errCtx1);
      const p2 = plugin.onError(errCtx2);

      resolveRefresh({ kind: 'bearer', token: 'new-tok' });

      await Promise.all([p1, p2]);

      expect(refreshFn).toHaveBeenCalledTimes(1);
      expect(errCtx1.retry).toHaveBeenCalledWith({ headers: { Authorization: 'Bearer new-tok' } });
      expect(errCtx2.retry).toHaveBeenCalledWith({ headers: { Authorization: 'Bearer new-tok' } });
    });
  });

  // -------------------------------------------------------------------------
  // 4. app.getAuthProvider surface
  // -------------------------------------------------------------------------
  describe('app.getAuthProvider surface', () => {
    it('is defined on the built app', () => {
      const provider = makeBearerProvider('tok');
      const app = createHAI3().use(auth({ provider })).build();

      expect(app.getAuthProvider).toBeDefined();

      app.destroy();
    });

    it('exposes provider reference via app.getAuthProvider()', () => {
      const provider = makeBearerProvider('tok');
      const app = createHAI3().use(auth({ provider })).build();

      expect(app.getAuthProvider?.()).toBe(provider);

      app.destroy();
    });

    it('session is available via app.getAuthProvider().getSession', async () => {
      const provider = makeBearerProvider('tok');
      const app = createHAI3().use(auth({ provider })).build();
      const ctx = {};
      const fp = app.getAuthProvider!() as FrontxAuthProvider;

      await fp.getSession(ctx);

      expect(provider.getSession).toHaveBeenCalledWith(ctx);

      app.destroy();
    });

    it('provider.checkAuth is reachable via getAuthProvider()', async () => {
      const provider = makeBearerProvider('tok');
      const app = createHAI3().use(auth({ provider })).build();
      const fp = app.getAuthProvider!() as FrontxAuthProvider;

      await fp.checkAuth();

      expect(provider.checkAuth).toHaveBeenCalled();

      app.destroy();
    });

    it('provider.logout is reachable via getAuthProvider()', async () => {
      const provider = makeBearerProvider('tok');
      const app = createHAI3().use(auth({ provider })).build();

      await app.getAuthProvider!().logout();

      expect(provider.logout).toHaveBeenCalled();

      app.destroy();
    });

    it('optional canAccess and subscribe on provider work via getAuthProvider()', async () => {
      const unsubscribe = vi.fn();
      const provider: FrontxAuthProvider = {
        ...makeBearerProvider('tok'),
        canAccess: vi.fn().mockResolvedValue('allow'),
        subscribe: vi.fn().mockReturnValue(unsubscribe),
      };
      const app = createHAI3().use(auth({ provider })).build();
      const fp = app.getAuthProvider!() as FrontxAuthProvider;

      const decision = await fp.canAccess?.({ action: 'read', resource: 'x' });
      expect(decision).toBe('allow');
      expect(provider.canAccess).toHaveBeenCalledTimes(1);

      const unsub = fp.subscribe?.(() => undefined);
      expect(unsub).toBe(unsubscribe);
      expect(provider.subscribe).toHaveBeenCalledTimes(1);

      app.destroy();
    });

    // -----------------------------------------------------------------------
    // 9. provider lifecycle: onAppInit, onAppDestroy
    // -----------------------------------------------------------------------
    it('calls provider.onAppInit(app) when app is built', () => {
      const onAppInit = vi.fn();
      const provider: FrontxAuthProvider = { ...makeBearerProvider('tok'), onAppInit };
      const app = createHAI3().use(auth({ provider })).build();

      expect(onAppInit).toHaveBeenCalledTimes(1);
      expect(onAppInit).toHaveBeenCalledWith(app);

      app.destroy();
    });

    it('calls provider.onAppDestroy(app) when app.destroy() is called', () => {
      const onAppDestroy = vi.fn();
      const provider: FrontxAuthProvider = { ...makeBearerProvider('tok'), onAppDestroy };
      const app = createHAI3().use(auth({ provider })).build();

      app.destroy();

      expect(onAppDestroy).toHaveBeenCalledTimes(1);
      expect(onAppDestroy).toHaveBeenCalledWith(app);
    });

    it('does not throw when provider has no onAppDestroy method', () => {
      const provider = makeBearerProvider('tok');
      const app = createHAI3().use(auth({ provider })).build();

      expect(() => app.destroy()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 6. Transport error hooks
  // -------------------------------------------------------------------------
  describe('transport error hooks', () => {
    it('calls provider.onTransportError for every transport error', async () => {
      const onTransportError = vi.fn();
      const provider: FrontxAuthProvider = { ...makeBearerProvider('tok'), onTransportError };
      const plugin = capturePlugin(provider);

      const err = new Error('Network failure');
      const errCtx = {
        error: err,
        request: makeReqCtx('/api'),
        response: { status: 500, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn(),
      };

      await plugin.onError(errCtx);

      expect(onTransportError).toHaveBeenCalledTimes(1);
      expect(onTransportError).toHaveBeenCalledWith(
        expect.objectContaining({ error: err, status: 500 }),
      );
    });

    it('calls provider.onTransportError even for 401 errors that will be retried', async () => {
      const onTransportError = vi.fn();
      const refreshFn = vi.fn().mockResolvedValue({ kind: 'bearer', token: 'new-tok' } satisfies AuthSession);
      const provider: FrontxAuthProvider = {
        ...makeBearerProvider('old-tok', refreshFn),
        onTransportError,
      };
      const plugin = capturePlugin(provider);

      const errCtx = {
        error: new Error('HTTP 401'),
        request: makeReqCtx('/api'),
        response: { status: 401, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn().mockResolvedValue({ status: 200, headers: {}, data: {} }),
      };

      await plugin.onError(errCtx);

      expect(onTransportError).toHaveBeenCalledTimes(1);
      expect(errCtx.retry).toHaveBeenCalledTimes(1);
    });

    it('does not throw when provider has no onTransportError hook', async () => {
      const plugin = capturePlugin(makeBearerProvider('tok')); // no onTransportError

      const errCtx = {
        error: new Error('HTTP 500'),
        request: makeReqCtx('/api'),
        response: { status: 500, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn(),
      };

      const result = await plugin.onError(errCtx);
      expect(result).toBe(errCtx.error);
    });
  });

  // -------------------------------------------------------------------------
  // 10. Protocol-relative URL credential leak
  // -------------------------------------------------------------------------
  describe('protocol-relative URL', () => {
    it('does NOT set withCredentials for protocol-relative URLs', async () => {
      const plugin = capturePlugin(makeCookieProvider());

      const result = (await plugin.onRequest(makeReqCtx('//cdn.example.com/asset'))) as RestRequestContext;

      expect(result.withCredentials).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 11. Opaque origin "null" (sandboxed iframe / file://)
  // -------------------------------------------------------------------------
  describe('opaque origin', () => {
    it('does NOT match opaque "null" origin against URL origins', async () => {
      const saved = (globalThis as Record<string, unknown>).location;
      (globalThis as Record<string, unknown>).location = { origin: 'null' };

      try {
        const plugin = capturePlugin(makeCookieProvider());

        // An absolute URL whose origin happens to be 'https://null' should NOT get credentials
        const result = (await plugin.onRequest(makeReqCtx('https://null/api'))) as RestRequestContext;

        expect(result.withCredentials).toBeUndefined();
      } finally {
        (globalThis as Record<string, unknown>).location = saved;
      }
    });
  });

  // -------------------------------------------------------------------------
  // 12. Custom session kind (pass-through)
  // -------------------------------------------------------------------------
  describe('custom session kind', () => {
    it('does not modify request for custom sessions', async () => {
      const provider: FrontxAuthProvider = {
        login: vi.fn().mockResolvedValue(noopTransition),
        logout: vi.fn().mockResolvedValue(noopTransition),
        handleCallback: vi.fn().mockResolvedValue(noopTransition),
        getIdentity: vi.fn().mockResolvedValue(null),
        getSession: vi.fn().mockResolvedValue({ kind: 'custom' } satisfies AuthSession),
        checkAuth: vi.fn().mockResolvedValue({ authenticated: true }),
      };
      const plugin = capturePlugin(provider);

      const original = makeReqCtx('/api');
      const result = (await plugin.onRequest(original)) as RestRequestContext;

      expect(result.headers['Authorization']).toBeUndefined();
      expect(result.withCredentials).toBeUndefined();
    });

    it('returns error without retry for refreshed custom sessions', async () => {
      const refreshFn = vi.fn().mockResolvedValue({ kind: 'custom' } satisfies AuthSession);
      const provider: FrontxAuthProvider = {
        login: vi.fn().mockResolvedValue(noopTransition),
        logout: vi.fn().mockResolvedValue(noopTransition),
        handleCallback: vi.fn().mockResolvedValue(noopTransition),
        getIdentity: vi.fn().mockResolvedValue(null),
        getSession: vi.fn().mockResolvedValue({ kind: 'custom' } satisfies AuthSession),
        checkAuth: vi.fn().mockResolvedValue({ authenticated: true }),
        refresh: refreshFn,
      };
      const plugin = capturePlugin(provider);

      const errCtx = {
        error: new Error('HTTP 401'),
        request: makeReqCtx('/api'),
        response: { status: 401, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn(),
      };

      const result = await plugin.onError(errCtx);

      expect(refreshFn).toHaveBeenCalledTimes(1);
      expect(errCtx.retry).not.toHaveBeenCalled();
      expect(result).toBe(errCtx.error);
    });
  });

  // -------------------------------------------------------------------------
  // 13. Refresh rejection safety (concurrent waiters)
  // -------------------------------------------------------------------------
  describe('refresh rejection safety', () => {
    it('returns error for all concurrent waiters when refresh rejects', async () => {
      const refreshFn = vi.fn().mockRejectedValue(new Error('refresh failed'));
      const plugin = capturePlugin(makeBearerProvider('tok', refreshFn));

      const makeErrCtx = () => ({
        error: new Error('HTTP 401'),
        request: makeReqCtx('/api'),
        response: { status: 401, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn(),
      });

      const ctx1 = makeErrCtx();
      const ctx2 = makeErrCtx();

      const [result1, result2] = await Promise.all([
        plugin.onError(ctx1),
        plugin.onError(ctx2),
      ]);

      expect(result1).toBe(ctx1.error);
      expect(result2).toBe(ctx2.error);
      expect(ctx1.retry).not.toHaveBeenCalled();
      expect(ctx2.retry).not.toHaveBeenCalled();
      // Single refresh call (deduped)
      expect(refreshFn).toHaveBeenCalledTimes(1);
    });
  });
});
