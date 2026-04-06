/**
 * @cyberfabric/react - Type Definitions
 *
 * Core types for FrontX React bindings.
 * Provides type-safe hooks and components.
 *
 * Now using real imports from @cyberfabric/framework since packages are built together.
 */

import type { ReactNode } from 'react';
import type {
  HAI3Config,
  HAI3App,
  RootState,
  Language,
  Formatters,
  AuthLoginInput,
  AuthTransition,
  AuthIdentity,
  AuthProvider,
} from '@cyberfabric/framework';
import type { MfeContextValue } from './mfe/MfeContext';

// Re-export imported types for convenience
export type { HAI3Config, HAI3App };

// ============================================================================
// Type Aliases
// ============================================================================

// From @cyberfabric/store
type Selector<TResult, TState = RootState> = (state: TState) => TResult;

// Language is imported from @cyberfabric/framework
type TranslationParams = Record<string, string | number | boolean>;

// ============================================================================
// FrontX Provider Props
// ============================================================================

/**
 * FrontX Provider Props
 * Props for the main FrontXProvider component.
 *
 * @example
 * ```tsx
 * <FrontXProvider config={{ devMode: true }}>
 *   <App />
 * </FrontXProvider>
 *
 * // With pre-built app
 * const app = createFrontX().use(screensets()).use(microfrontends()).build();
 * <FrontXProvider app={app}>
 *   <App />
 * </FrontXProvider>
 *
 * // With MFE bridge (for MFE components)
 * <FrontXProvider mfeBridge={{ bridge, extensionId, domainId }}>
 *   <MyMfeApp />
 * </FrontXProvider>
 * ```
 */
export interface HAI3ProviderProps {
  /** Child components */
  children: ReactNode;
  /** FrontX configuration */
  config?: HAI3Config;
  /** Pre-built FrontX app instance (optional) */
  app?: HAI3App;
  /** MFE bridge context (for MFE components) */
  mfeBridge?: MfeContextValue;
}

// ============================================================================
// Hook Return Types
// ============================================================================

/**
 * useFrontX Hook Return Type
 * Returns the FrontX app instance from context.
 */
export type UseHAI3Return = HAI3App;

/**
 * useAppSelector Hook
 * Type-safe selector hook for Redux state.
 *
 * @template TResult - The result type of the selector
 */
export type UseAppSelector = <TResult>(selector: Selector<TResult>) => TResult;

/**
 * useAppDispatch Hook Return Type
 * Returns the typed dispatch function.
 */
export type UseAppDispatchReturn = (action: unknown) => unknown;

/**
 * useTranslation Hook Return Type
 * Translation utilities.
 */
export interface UseTranslationReturn {
  /** Translate a key */
  t: (key: string, params?: TranslationParams) => string;
  /** Current language */
  language: Language | null;
  /** Change language */
  setLanguage: (language: Language) => void;
  /** Check if current language is RTL */
  isRTL: boolean;
}

/**
 * useScreenTranslations Hook Return Type
 * Screen-level translation loading state.
 */
export interface UseScreenTranslationsReturn {
  /** Whether translations are loaded */
  isLoaded: boolean;
  /** Loading error (if any) */
  error: Error | null;
}

/**
 * useTheme Hook Return Type
 * Theme utilities.
 */
export interface UseThemeReturn {
  /** Current theme ID */
  currentTheme: string | undefined;
  /** All available themes */
  themes: Array<{ id: string; name: string }>;
  /** Change theme */
  setTheme: (themeId: string) => void;
}

/**
 * useFormatters Hook Return Type
 * Locale-aware formatters (locale from i18nRegistry.getLanguage()).
 * References @cyberfabric/i18n Formatters so signatures stay in sync.
 */
export type UseFormattersReturn = Formatters;

// ============================================================================
// Auth Hook Return Types
// ============================================================================

/**
 * useLogin Hook Return Type
 * Calls authProvider.login() and handles redirect on success.
 *
 * @param input - Login credentials
 * @param redirectTo - Optional redirect URL override (takes priority over AuthTransition.redirectUrl)
 * @returns The AuthTransition from the provider
 */
export type UseLoginReturn = (input: AuthLoginInput, redirectTo?: string) => Promise<AuthTransition>;

/**
 * useLogout Hook Return Type
 * Calls authProvider.logout() and handles redirect on success.
 *
 * @param redirectTo - Optional redirect URL override (takes priority over AuthTransition.redirectUrl)
 * @returns The AuthTransition from the provider
 */
export type UseLogoutReturn = (redirectTo?: string) => Promise<AuthTransition>;

/**
 * useGetIdentity Hook Return Type
 * Fetches user identity on mount and exposes reactive state.
 */
export interface UseGetIdentityReturn<TIdentity extends AuthIdentity = AuthIdentity> {
  /** The fetched identity, or null if not yet loaded / not available */
  identity: TIdentity | null;
  /** Whether the identity fetch is in progress */
  isPending: boolean;
  /** Error from the identity fetch, if any */
  error: Error | null;
  /** Re-trigger the identity fetch */
  refetch: () => void;
}

// ============================================================================
// App Runtime Extensions & Resolved Auth Provider
// ============================================================================

/**
 * Application-level type overrides.
 *
 * Augment via `declare module '@cyberfabric/react'` to narrow the auth
 * provider type globally.
 *
 * @example
 * ```typescript
 * declare module '@cyberfabric/react' {
 *   interface AppRuntimeExtensions {
 *     authProvider: MyConcreteAuthProvider;
 *   }
 * }
 * ```
 */
export interface AppRuntimeExtensions {}

type ResolveKey<T, K extends string, Fallback> =
  K extends keyof T ? T[K] : Fallback;

/**
 * Resolves the effective auth provider type from the react-side
 * `AppRuntimeExtensions` (merges both framework and react augmentations).
 */
export type ResolvedAuthProvider = ResolveKey<AppRuntimeExtensions, 'authProvider', AuthProvider>;

/**
 * Global bridge interface used to forward react-side augmentations into
 * the framework's `AppRuntimeExtensions`. A global is needed because
 * `interface extends` inside `declare module` cannot use inline `import()`
 * expressions (TS2499).
 */
declare global {
  interface __CyberfabricReactAppRuntimeExtensions extends AppRuntimeExtensions {}
}

/**
 * Forward react-side augmentations into the framework so that
 * `HAI3App.getAuthProvider()` (typed via framework's `ResolvedAuthProvider`)
 * picks up the narrowed auth provider type automatically.
 */
declare module '@cyberfabric/framework' {
  interface AppRuntimeExtensions extends __CyberfabricReactAppRuntimeExtensions {}
}
