# Exploration: Auth Redux Integration

Date: 2026-04-10

## Research question

How should the auth plugin project AuthProvider state into Redux for reactive UI consumption, while preserving the provider as the single source of truth?

## Scope

In scope:

- Redux state shape for auth session and permissions
- Token safety in serialized state
- Sync strategy between AuthProvider and Redux
- Action design for auth operations
- Type safety via module augmentation

Out of scope:

- AuthProvider contract changes (already defined in @cyberfabric/auth)
- Transport binding changes (already handled by auth plugin)
- React component design beyond the useAuth hook

## Findings

### 1. Why Redux instead of a registry pattern

Auth state is fundamentally different from registries (themes, i18n, screensets):

- **Async with failure modes**: auth operations (checkAuth, login, refresh) can fail, need loading/error tracking.
- **Derived state**: `isAuthenticated` is derived from `status`, permissions require separate fetch cycles.
- **Reactive updates**: UI components need to re-render when auth state changes (login, logout, token refresh, permission changes).
- **Already established pattern**: Redux slices with effects already handle this in layout and mock domains.

A registry would require inventing a subscription mechanism that Redux already provides via `useAppSelector`.

### 2. Token safety: AuthSessionMeta vs sentinel values

Two approaches were considered for keeping tokens out of Redux state:

- **Sentinel values**: Store the full `AuthSession` but replace token fields with a sentinel string (e.g., `"[REDACTED]"`). Simpler, but consumers might accidentally use the sentinel as a real token, and TypeScript cannot distinguish redacted from real sessions.
- **AuthSessionMeta type**: A separate type containing only `kind` and optional `expiresAt`. TypeScript enforces the distinction at compile time via `isFullAuthSession()` type guard.

`AuthSessionMeta` was chosen because:

- Type safety prevents accidental token usage from Redux state.
- The `isFullAuthSession()` type guard makes the check explicit and compiler-enforced.
- Cookie and custom sessions have no mandatory sensitive fields, so the guard handles all session kinds correctly.
- Consumers who need actual tokens have a clear path: call `app.auth.getSession()`.

### 3. SRP: two slices for independent update cycles

Auth session and permissions are separated into `auth/session` and `auth/permissions` because:

- Permissions can change independently (role assignment) without re-checking the session.
- Session refreshes do not necessarily change permissions.
- Separate loading/error states prevent UI flicker (e.g., permissions loading should not show the login screen).
- Independent slices enable fine-grained `useAppSelector` subscriptions (a component that only reads permissions does not re-render on session changes).

### 4. Sync strategy

Two sync modes operate in parallel:

- **Reactive (provider.subscribe)**: When the provider supports `subscribe()`, state changes are pushed immediately via the `auth/session/state-changed` event. This is the preferred path for real-time auth state.
- **Imperative (actions)**: `syncAuth()`, `loginAction()`, `logoutAction()`, `refreshAuth()`, and `fetchPermissions()` trigger explicit state transitions. These work regardless of whether `subscribe()` is implemented.

Since `subscribe()` is optional on AuthProvider, the imperative path is always available as a fallback. Without `subscribe()`, Redux auth state only updates when actions are explicitly called.

### 5. Module augmentation for HAI3Actions

Auth actions are declared on `HAI3Actions` via module augmentation from `plugins/auth.ts`, not statically in `types.ts`. This follows the plugin composition principle from ADR 0003: plugins declare their own type contributions. The `types.ts` file defines the base `HAI3Actions` interface as an extensible empty contract; each plugin extends it.

## Known limitations and trade-offs

- **Stale state window**: Between a provider mutation (e.g., external token revocation) and the next sync, Redux state may be stale. Mitigated by `provider.subscribe()` when available.
- **No automatic retry**: If `syncAuth()` fails, the error is stored but no automatic retry occurs. Consumers must call `syncAuth()` again.
- **Permissions auto-fetch coupling**: On sync, permissions are automatically fetched if `provider.getPermissions` exists. This may cause unnecessary fetches if permissions rarely change. `fetchPermissions()` provides an independent path.
- **Initial status is loading**: The `auth/session` slice starts with `status: 'loading'` to prevent a flash of unauthenticated UI before the first sync completes.

## References

- ADR 0002: Event-driven Flux dataflow
- ADR 0003: Plugin-based framework composition
- Exploration: 2026-03-27-authprovider-architecture-research.md
