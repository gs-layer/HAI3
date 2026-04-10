import { createSlice, type ReducerPayload } from '@cyberfabric/state';
import type { AuthCapabilities } from '@cyberfabric/auth';
import type { AuthSessionSliceState, AuthSessionMeta } from '../authTypes';
import type { AuthSession, AuthState } from '@cyberfabric/auth';

/**
 * Auth session slice — manages authentication session state.
 *
 * This slice is provided by the auth plugin and lives at state['auth/session'].
 * Redux is a projection of the AuthProvider state — provider is the source of truth.
 *
 * Event-driven: effects listen to auth events and update this slice.
 */

const SLICE_KEY = 'auth/session' as const;

const initialState: AuthSessionSliceState = {
  status: 'loading',
  session: null,
  error: null,
  lastSyncAt: null,
  capabilities: null,
};

const { slice, setAuthSessionState, setAuthLoading, setAuthError, setAuthCapabilities } = createSlice({
  name: SLICE_KEY,
  initialState,
  reducers: {
    setAuthSessionState: (
      state: AuthSessionSliceState,
      action: ReducerPayload<{
        status: AuthState;
        session: AuthSession | AuthSessionMeta | null;
        error: string | null;
        lastSyncAt: number;
      }>,
    ) => {
      state.status = action.payload.status;
      state.session = action.payload.session;
      state.error = action.payload.error;
      state.lastSyncAt = action.payload.lastSyncAt;
    },
    setAuthLoading: (state: AuthSessionSliceState) => {
      state.status = 'loading';
      state.error = null;
    },
    setAuthError: (state: AuthSessionSliceState, action: ReducerPayload<string>) => {
      state.status = 'error';
      state.error = action.payload;
    },
    setAuthCapabilities: (
      state: AuthSessionSliceState,
      action: ReducerPayload<AuthCapabilities | null>,
    ) => {
      state.capabilities = action.payload;
    },
  },
});

export const authSessionSlice = slice;
export const authSessionActions = { setAuthSessionState, setAuthLoading, setAuthError, setAuthCapabilities };

export { setAuthSessionState, setAuthLoading, setAuthError, setAuthCapabilities };

export default slice.reducer;
