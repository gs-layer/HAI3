
# Auth Plugin Guidelines (Canonical)

## AI WORKFLOW (REQUIRED)
1) Summarize 3-6 rules from this file before making changes.
2) STOP if you add React, or direct HTTP/fetch dependencies to the auth module.

## SCOPE
- Directory: `packages/framework/src/plugins/auth/`
- Layer: L2 Framework (plugin module, no React code)
- Two sub-layers:
  - `types.ts` + `plugin.ts` — headless AuthProvider contract (base types + plugin factory)
  - `frontx/` — Frontx-specific concrete provider, REST transport binding, session types

## CRITICAL RULES
- REQUIRED: Base contract (`types.ts`) contains only TypeScript interfaces and type aliases. No runtime code.
- REQUIRED: No React imports anywhere in the auth module.
- REQUIRED: `AuthProvider` is the single extension point for headless auth.
- REQUIRED: All provider methods accept optional `AuthContext` with `AbortSignal`.
- REQUIRED: `frontxAuthProvider()` factory creates a `FrontxAuthProvider` with auto-registered `FrontxAuthRestPlugin`.
- REQUIRED: Transport binding (credential injection, 401 refresh+retry) handled by `FrontxAuthRestPlugin`, registered via `apiRegistry.plugins.add()`.

## DIRECTORY STRUCTURE

```
packages/framework/src/plugins/auth/
├── index.ts          — public barrel (re-exports plugin + types + frontx/)
├── types.ts          — base AuthProvider contract, inputs, results, permissions
├── plugin.ts         — auth() plugin factory (exposes app.getAuthProvider())
└── frontx/
    ├── index.ts      — frontx barrel
    ├── types.ts      — session kinds, transport types, capabilities, state events
    ├── provider.ts   — frontxAuthProvider() factory + FrontxAuthProvider interface
    ├── auth-rest-plugin.ts — FrontxAuthRestPlugin (bearer/cookie injection, 401 refresh+retry)
    └── transport-utils.ts  — URL/origin helpers, credential inclusion logic
```

## BASE AUTH PROVIDER CONTRACT (`types.ts`)

### Required methods
- `login(input, ctx?)` -> AuthTransition
- `logout(ctx?)` -> AuthTransition

### Optional methods
- `handleCallback?(input, ctx?)` -> AuthTransition (OAuth/SAML redirects)
- `getIdentity?(ctx?)` -> TIdentity | null
- `checkAuth?(ctx?)` -> AuthCheckResult
- `getPermissions?(ctx?)` -> AuthPermissions
- `canAccess?(query, ctx?)` -> AccessDecision ('allow' | 'deny')

### Optional lifecycle
- `onAppInit?(app)` -> void | Promise<void> (called after app is built, receives HAI3App)
- `onAppDestroy?(app)` -> void | Promise<void> (called on app teardown, receives HAI3App)

## AUTH PLUGIN (`plugin.ts`)
- `auth(config)` returns an `HAI3Plugin` that:
  - Exposes `app.getAuthProvider()` via `provides.app`
  - Calls `provider.onAppInit(app)` on init
  - Calls `provider.onAppDestroy(app)` on destroy
- Config: `{ provider: AuthProvider }`

## FRONTX AUTH PROVIDER (`frontx/provider.ts`)

### `FrontxAuthProvider` interface
- Extends `AuthProvider` with:
  - `getSession(ctx?)` -> AuthSession | null
  - `checkAuth(ctx?)` -> FrontxAuthCheckResult
  - `refresh?(ctx?)` -> AuthSession | null
  - `onTransportError?(event)` -> void
  - `subscribe?(listener)` -> AuthUnsubscribe
  - `capabilities?: AuthCapabilities`

### `frontxAuthProvider(config, options?)` factory
- Creates a `FrontxAuthProvider` that auto-registers `FrontxAuthRestPlugin` with `apiRegistry` on app init.
- Options: `{ allowedCookieOrigins?, csrfHeaderName? }`

## SESSION KINDS (`frontx/types.ts`)
- `bearer`: transport attaches `Authorization: Bearer <token>` header.
- `cookie`: transport sets `withCredentials: true` + optional CSRF header.
- `custom`: provider-defined, transport ignores.
- Discriminated via `session.kind`.

## REST TRANSPORT (`frontx/auth-rest-plugin.ts`)
- `FrontxAuthRestPlugin` extends `RestPluginWithConfig`:
  - `onRequest`: injects bearer token or cookie credentials per session kind.
  - `onError`: on 401, calls `refresh()` once (deduplicating concurrent calls), retries with new session.
- Cookie credentials only for relative URLs and allowlisted origins (see `transport-utils.ts`).

## ACCESS CONTROL
- Primary API: `canAccess(query)` with action + resource + optional record.
- NOT roles-first: roles are metadata inside AuthPermissions, not the primary check.

## STOP CONDITIONS
- Adding runtime code (classes, functions, side effects) to base `types.ts`.
- Adding React components or hooks.
- Modifying AuthProvider required methods (breaking change).
- Bypassing the plugin architecture (e.g. direct apiRegistry manipulation outside the plugin).

## PRE-DIFF CHECKLIST
- [ ] Base `types.ts` has only type exports (no runtime code).
- [ ] AuthProvider backward-compatible (new methods optional).
- [ ] All methods accept AuthContext for cancellation.
- [ ] FrontxAuthRestPlugin registered/unregistered via plugin lifecycle (onAppInit/onAppDestroy).
- [ ] No React code in any auth module file.
