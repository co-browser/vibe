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
 * Store interface defining the core operations
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
};

export type { AppState } from "./types";
export { mainStore } from "./store";

// Export desktop store functionality
export * from "./desktop-store";
