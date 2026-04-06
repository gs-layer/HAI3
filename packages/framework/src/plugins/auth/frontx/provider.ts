import { RestProtocol } from '@cyberfabric/api';
import type { AuthContext, AuthIdentity, AuthProvider } from '../types';
import type { AuthCapabilities, AuthSession, AuthStateListener, AuthTransportErrorEvent, AuthUnsubscribe, FrontxAuthCheckResult, FrontxAuthIdentity } from './types';
import type { HAI3App } from '../../../types';
import { FrontxAuthRestPlugin } from './auth-rest-plugin';

// ---------------------------------------------------------------------------
// FrontxAuthProvider — extends AuthProvider with transport/session/permission
// ---------------------------------------------------------------------------

export interface FrontxAuthProvider<
  TIdentity extends AuthIdentity = FrontxAuthIdentity,
> extends AuthProvider<TIdentity> {
  getSession(ctx?: AuthContext): Promise<AuthSession | null>;
  checkAuth(ctx?: AuthContext): Promise<FrontxAuthCheckResult<TIdentity>>;

  refresh?(ctx?: AuthContext): Promise<AuthSession | null>;
  onTransportError?(event: AuthTransportErrorEvent): void;
  subscribe?(listener: AuthStateListener<TIdentity>): AuthUnsubscribe;
  capabilities?: AuthCapabilities;
}

// ---------------------------------------------------------------------------
// Config & options
// ---------------------------------------------------------------------------

export type FrontxAuthProviderConfig<TIdentity extends AuthIdentity = FrontxAuthIdentity> =
  Pick<FrontxAuthProvider<NoInfer<TIdentity>>, 'login' | 'logout' | 'getSession' | 'checkAuth'> &
  Partial<Pick<FrontxAuthProvider<TIdentity>,
    | 'handleCallback'
    | 'getIdentity'
    | 'refresh'
    | 'getPermissions'
    | 'canAccess'
    | 'onTransportError'
    | 'subscribe'
    | 'capabilities'
  >>;

/** REST transport options passed to {@link frontxAuthProvider} as the second argument. */
export type FrontxAuthProviderOptions = {
  allowedCookieOrigins?: string[];
  csrfHeaderName?: string;
};

export const frontxAuthProvider = <
  TIdentity extends AuthIdentity = FrontxAuthIdentity,
  TExtra extends Record<string, unknown> = Record<string, never>,
>(
    config: FrontxAuthProviderConfig<TIdentity> & TExtra,
    options?: FrontxAuthProviderOptions,
  ): FrontxAuthProvider<TIdentity> & TExtra => {
    let restPlugin: FrontxAuthRestPlugin | null = null;

    return {
      ...config,
      onAppInit(app: HAI3App) {
        restPlugin = new FrontxAuthRestPlugin({
          getSession: config.getSession,
          refresh: config.refresh,
          onTransportError: config.onTransportError,
          allowedCookieOrigins: options?.allowedCookieOrigins,
          csrfHeaderName: options?.csrfHeaderName,
        });
        app.apiRegistry.plugins.add(RestProtocol, restPlugin);
      },
      onAppDestroy(app: HAI3App) {
        app.apiRegistry.plugins.remove(RestProtocol, FrontxAuthRestPlugin);
        restPlugin = null;
      },
    };
  };
