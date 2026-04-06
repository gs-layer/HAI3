import type { AuthPluginConfig, AuthProvider } from './types';
import type { HAI3Plugin, ResolvedAuthProvider } from '../../types';

/**
 * Auth plugin.
 *
 * Exposes `app.getAuthProvider()` by wiring a headless AuthProvider into the application.
 * Transport binding (e.g. REST credential injection) is handled by `frontxAuthProvider`,
 * which creates a `FrontxAuthRestPlugin` and registers it with the API registry on init.
 */
export function auth<T extends AuthProvider>(config: AuthPluginConfig<T>): HAI3Plugin<AuthPluginConfig<T>> {
  const provider = config.provider;

  return {
    name: 'auth',
    provides: {
      app: { getAuthProvider: () => provider as unknown as ResolvedAuthProvider },
    },
    onInit(app) {
      provider.onAppInit?.(app);
    },
    onDestroy(app) {
      provider.onAppDestroy?.(app);
    },
  };
}
