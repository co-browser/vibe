/**
 * Store exports
 * Defines the store interface and exports store-related types
 */

import type { AppState } from "./types";

/**
 * Subscribe function type for the store
 */
export type Subscribe = (
  listener: (state: AppState, prevState: AppState) => void,
) => () => void;

/**
 * Store initialization status interface
 */
export interface StoreInitializationStatus {
  isInitialized: boolean;
  isInitializing: boolean;
  lastError: Error | null;
}

/**
 * Store interface defining the core operations with type safety
 */
export type Store = {
  getState: () => AppState;
  getInitialState: () => AppState;
  setState: (
    partial:
      | AppState
      | Partial<AppState>
      | ((state: AppState) => AppState | Partial<AppState>),
    replace?: boolean,
  ) => void;
  subscribe: Subscribe;

  // Initialization methods
  initialize?: () => Promise<void>;
  ensureInitialized?: () => Promise<void>;
  isStoreReady?: () => boolean;
  getInitializationStatus?: () => StoreInitializationStatus;
  cleanup?: () => void;
};

export type { AppState } from "./types";
export { mainStore } from "./store";
