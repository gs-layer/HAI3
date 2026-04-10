import { createSlice, type ReducerPayload } from '@cyberfabric/state';
import type { AuthPermissions } from '@cyberfabric/auth';
import type { AuthPermissionsSliceState } from '../authTypes';

/**
 * Auth permissions slice — manages RBAC permissions state.
 *
 * Separate from auth/session for SRP: permissions have independent
 * update cycles (e.g., re-fetched after role changes without re-checking session).
 *
 * Event-driven: effects listen to permission events and update this slice.
 */

const SLICE_KEY = 'auth/permissions' as const;

const initialState: AuthPermissionsSliceState = {
  permissions: null,
  loading: false,
  error: null,
};

const { slice, setPermissions, setPermissionsLoading, setPermissionsError, clearPermissions } = createSlice({
  name: SLICE_KEY,
  initialState,
  reducers: {
    setPermissions: (
      state: AuthPermissionsSliceState,
      action: ReducerPayload<AuthPermissions | null>,
    ) => {
      state.permissions = action.payload;
      state.loading = false;
      state.error = null;
    },
    setPermissionsLoading: (
      state: AuthPermissionsSliceState,
      action: ReducerPayload<boolean>,
    ) => {
      state.loading = action.payload;
    },
    setPermissionsError: (
      state: AuthPermissionsSliceState,
      action: ReducerPayload<string>,
    ) => {
      state.error = action.payload;
      state.loading = false;
    },
    clearPermissions: (state: AuthPermissionsSliceState) => {
      state.permissions = null;
      state.loading = false;
      state.error = null;
    },
  },
});

export const authPermissionsSlice = slice;
export const authPermissionsActions = {
  setPermissions,
  setPermissionsLoading,
  setPermissionsError,
  clearPermissions,
};

export { setPermissions, setPermissionsLoading, setPermissionsError, clearPermissions };

export default slice.reducer;
