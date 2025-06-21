/**
 * Store hook for the renderer process
 * Provides access to the main process store via IPC bridge
 */

import { useStore as useZustandStore, type StoreApi } from "zustand";
import { createStore as createZustandVanillaStore } from "zustand/vanilla";

import type { AppState } from "../../../main/store/types";
import type { ChatMessage } from "@vibe/shared-types";
const logger = {
  error: (msg: string, ...args: any[]) =>
    console.error(`[RendererStore] ${msg}`, ...args),
};

/**
 * Interface for the bridge communication
 */
export interface Handlers<S> {
  /**
   * Gets the current state from the main process
   */
  getState(): Promise<S>;

  /**
   * Subscribes to state changes from the main process
   * @param callback Function called when state changes
   * @returns Unsubscribe function
   */
  subscribe(callback: (newState: S) => void): () => void;
}

/**
 * Creates a bridged vanilla store that syncs with the main process
 * @param bridge The bridge to the main process store
 * @returns A Zustand store API
 */
const createBridgedVanillaStore = <S>(bridge: Handlers<S>): StoreApi<S> => {
  const store = createZustandVanillaStore<S>(set => {
    // Subscribe to updates from the main process via the bridge
    bridge.subscribe(newStateFromBridge => {
      if (newStateFromBridge) {
        set(newStateFromBridge, true); // Replace the entire state
      }
    });

    // Fetch initial state from the main process store via the bridge
    bridge
      .getState()
      .then(mainState => {
        if (mainState) {
          set(mainState, true);
        }
      })
      .catch(error => {
        logger.error(
          "Failed to get initial state from main process via bridge:",
          error,
        );
      });

    // The store starts "empty" as the true state comes from the bridge.
    return {} as S;
  });

  return store;
};

// Utility types for creating the bound store hook
type ExtractState<S_Store> = S_Store extends { getState: () => infer T }
  ? T
  : never;

type ReadonlyStoreApi<T_State> = Pick<
  StoreApi<T_State>,
  "getState" | "subscribe"
>;

type UseBoundStore<S_Store extends ReadonlyStoreApi<unknown>> = {
  (): ExtractState<S_Store>;
  <U>(selector: (state: ExtractState<S_Store>) => U): U;
} & S_Store;

/**
 * Creates a React hook for a bridged Zustand store
 * @param bridge The bridge to the main process store
 * @returns A hook to access the store
 */
const createUseBridgedStore = <S_AppState extends AppState>(
  bridge: Handlers<S_AppState> | undefined,
): UseBoundStore<StoreApi<S_AppState>> => {
  if (!bridge) {
    const initialLocalState: AppState = {
      messages: [],
      requestedTabContext: [],
      sessionTabs: [],
    };
    const dummyVanillaStore = createZustandVanillaStore<S_AppState>(
      () => initialLocalState as S_AppState,
    );

    function useDummyBoundStore(): S_AppState;
    function useDummyBoundStore<U_Slice>(
      selector: (state: S_AppState) => U_Slice,
    ): U_Slice;
    function useDummyBoundStore<U_Slice>(
      selector?: (state: S_AppState) => U_Slice,
    ): U_Slice | S_AppState {
      // Always call the hook unconditionally
      const state = useZustandStore(dummyVanillaStore);
      // Then use the result based on whether selector exists
      return selector ? selector(state) : state;
    }

    Object.assign(useDummyBoundStore, dummyVanillaStore);
    return useDummyBoundStore as UseBoundStore<StoreApi<S_AppState>>;
  }

  const vanillaStore = createBridgedVanillaStore<S_AppState>(bridge);

  function useBoundStore(): S_AppState;
  function useBoundStore<U_Slice>(
    selector: (state: S_AppState) => U_Slice,
  ): U_Slice;
  function useBoundStore<U_Slice>(
    selector?: (state: S_AppState) => U_Slice,
  ): U_Slice | S_AppState {
    // Always call the hook unconditionally
    const state = useZustandStore(vanillaStore);
    // Then use the result based on whether selector exists
    return selector ? selector(state) : state;
  }

  Object.assign(useBoundStore, vanillaStore);

  return useBoundStore as UseBoundStore<StoreApi<S_AppState>>;
};

/**
 * Hook to access the application store
 */
export const useAppStore = createUseBridgedStore<AppState>(
  window.vibe.session.stateBridge,
);

/**
 * Gets the current state directly
 * Useful for accessing state outside of React components
 */
export const getState = (): AppState => useAppStore.getState();

// Export types for convenience in components
export type { ChatMessage, AppState as MainAppState };
