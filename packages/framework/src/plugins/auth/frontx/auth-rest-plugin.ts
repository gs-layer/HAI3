import type { AuthContext } from '../types';
import type { AuthSession, AuthTransportErrorEvent } from './types';
import {
  RestPluginWithConfig,
  type ApiPluginErrorContext,
  type RestRequestContext,
  type RestResponseContext,
} from '@cyberfabric/api';
import { toAuthTransportRequest, shouldIncludeCredentials } from './transport-utils';

export type FrontxAuthRestPluginConfig = {
  getSession: (ctx?: AuthContext) => Promise<AuthSession | null>;
  refresh?: (ctx?: AuthContext) => Promise<AuthSession | null>;
  onTransportError?: (event: AuthTransportErrorEvent) => void;
  allowedCookieOrigins?: string[];
  csrfHeaderName?: string;
};

export class FrontxAuthRestPlugin extends RestPluginWithConfig<FrontxAuthRestPluginConfig> {
  /** Shared in-flight refresh promise — deduplicates concurrent 401 refresh calls. */
  private refreshPromise: Promise<AuthSession | null> | null = null;

  async onRequest(ctx: RestRequestContext): Promise<RestRequestContext> {
    const session = await this.config.getSession({ signal: ctx.signal });
    if (!session) return ctx;

    if (session.kind === 'cookie') {
      if (!shouldIncludeCredentials(ctx.url, this.config.allowedCookieOrigins)) return ctx;

      const next: RestRequestContext = { ...ctx, withCredentials: true };
      const csrfHeaderName = this.config.csrfHeaderName;
      if (csrfHeaderName && session.csrfToken) {
        return {
          ...next,
          headers: {
            ...next.headers,
            [csrfHeaderName]: session.csrfToken,
          },
        };
      }
      return next;
    }

    if (session.kind === 'bearer' && session.token) {
      return {
        ...ctx,
        headers: {
          ...ctx.headers,
          Authorization: `Bearer ${session.token}`,
        },
      };
    }

    // Custom sessions: no standard transport mechanism — use a custom transport binder for retry.
    return ctx;
  }

  async onError(ctx: ApiPluginErrorContext): Promise<Error | RestResponseContext> {
    const requestForHook = toAuthTransportRequest(ctx.request);
    if (requestForHook) {
      this.config.onTransportError?.({
        request: requestForHook,
        error: ctx.error,
        status: ctx.response?.status,
      });
    }

    if (ctx.response?.status !== 401) return ctx.error;
    if (ctx.retryCount !== 0) return ctx.error;
    if (!this.config.refresh) return ctx.error;

    // Dedup concurrent 401 refresh calls into a single in-flight promise.
    if (!this.refreshPromise) {
      this.refreshPromise = this.config
        .refresh({ signal: ctx.request.signal })
        .finally(() => {
          this.refreshPromise = null;
        });
    }

    let refreshed: AuthSession | null;
    try {
      refreshed = await this.refreshPromise;
    } catch {
      return ctx.error;
    }
    if (!refreshed) return ctx.error;

    if (refreshed.kind === 'bearer') {
      if (!refreshed.token) return ctx.error;
      return ctx.retry({
        headers: { Authorization: `Bearer ${refreshed.token}` },
      });
    }

    if (refreshed.kind === 'cookie') {
      return ctx.retry();
    }

    // Custom sessions: no standard retry mechanism — use a custom transport binder.
    return ctx.error;
  }
}
