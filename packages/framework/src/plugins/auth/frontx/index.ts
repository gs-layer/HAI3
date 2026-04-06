export type {
  BearerAuthSession,
  CookieAuthSession,
  CustomAuthSession,
  AuthSession,
  FrontxAuthIdentity,
  FrontxAuthCheckResult,
  AuthTransportRequest,
  AuthTransportResponse,
  AuthTransportAdapter,
  AuthTransportErrorEvent,
  AuthCapabilities,
  AuthState,
  AuthStateEvent,
  AuthStateListener,
  AuthUnsubscribe,
} from './types';

export {
  frontxAuthProvider,
  type FrontxAuthProvider,
  type FrontxAuthProviderConfig,
  type FrontxAuthProviderOptions,
} from './provider';

export { FrontxAuthRestPlugin, type FrontxAuthRestPluginConfig } from './auth-rest-plugin';

export {
  toAuthTransportRequest,
  isSupportedAuthTransportMethod,
  shouldIncludeCredentials,
  isRelativeUrl,
  getOrigin,
  getRuntimeOrigin,
} from './transport-utils';
