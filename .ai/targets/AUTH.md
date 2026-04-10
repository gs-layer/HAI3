# @cyberfabric/auth Guidelines (Canonical)

## AI WORKFLOW (REQUIRED)
1) Summarize 3-6 rules from this file before making changes.
2) STOP if you add framework, React, or HTTP transport dependencies.

## SCOPE
- Package: `packages/auth/`
- Layer: L1 SDK (zero @hai3 dependencies)
- Purpose: headless authentication contract (types only). Redux integration lives in @cyberfabric/framework (auth plugin).

## CRITICAL RULES
- REQUIRED: Only TypeScript interfaces and type aliases. No runtime code.
- REQUIRED: No React, no @cyberfabric/framework, no @cyberfabric/api imports.
- REQUIRED: AuthProvider contract is the single extension point.
- REQUIRED: Session mechanism via `AuthSession.kind` discriminant (bearer | cookie | custom).
- REQUIRED: All provider methods accept optional `AuthContext` with AbortSignal.

## AUTH PROVIDER CONTRACT

### Required methods
- `getSession(ctx?)` -> AuthSession | null
- `checkAuth(ctx?)` -> AuthCheckResult
- `logout(ctx?)` -> AuthTransition

### Optional lifecycle
- `login?(input, ctx?)` -> AuthTransition
- `handleCallback?(input, ctx?)` -> AuthTransition (OAuth/SAML redirects)
- `refresh?(ctx?)` -> AuthSession | null
- `destroy?()` -> void | Promise<void>

### Optional identity & permissions
- `getIdentity?(ctx?)` -> AuthIdentity | null
- `getPermissions?(ctx?)` -> AuthPermissions
- `canAccess?(query, ctx?)` -> AccessDecision ('allow' | 'deny')

### Optional events
- `onTransportError?(event)` -> void (informational, called by transport binding)
- `subscribe?(listener)` -> AuthUnsubscribe

## SESSION KINDS
- `bearer`: transport attaches `Authorization: Bearer <token>` header.
- `cookie`: transport sets `withCredentials: true` + optional CSRF header.
- `custom`: provider-defined, transport ignores.

## ACCESS CONTROL
- Primary API: `canAccess(query)` with action + resource + optional record.
- NOT roles-first: roles are metadata inside AuthPermissions, not the primary check.

## REDUX STATE INTEGRATION
- The auth plugin in @cyberfabric/framework projects AuthProvider state into Redux.
- `AuthSessionMeta` — token-safe snapshot type (`kind` + optional `expiresAt`). Used when `redux.includeTokens` is `false` (default). Consumers who need tokens call `app.auth.getSession()`.
- `isFullAuthSession(session)` — type guard distinguishing `AuthSession` from `AuthSessionMeta`. For bearer sessions, checks for the `token` field.
- `RootStateWithAuth` — root state extension type providing `state['auth/session']` and `state['auth/permissions']`.
- Known limitations:
  - `subscribe()` is optional on AuthProvider. Without it, Redux auth state only updates on explicit actions (syncAuth, loginAction, etc.).
  - Stale state is possible between provider mutations and the next sync.
  - Permissions are fetched automatically on sync if `provider.getPermissions` exists, but can also be fetched independently via `fetchPermissions()`.

## STOP CONDITIONS
- Adding runtime code (classes, functions, side effects).
- Adding @cyberfabric/* or third-party dependencies.
- Adding React components or hooks.
- Adding HTTP/transport logic (belongs in @cyberfabric/framework auth plugin).
- Modifying AuthProvider required methods (breaking change).

## PRE-DIFF CHECKLIST
- [ ] Only type exports (no runtime code).
- [ ] Zero dependencies in package.json.
- [ ] AuthProvider backward-compatible (new methods optional).
- [ ] All methods accept AuthContext for cancellation.
