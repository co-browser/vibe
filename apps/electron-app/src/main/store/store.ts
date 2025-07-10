import { store as zustandStore, initialState } from "./create";
import type { AppState } from "./types";
import type {
  Store as StoreInterface,
  Subscribe,
  StoreInitializationStatus,
} from "./index";

/**
 * Retrieves the current state from the store.
 * @returns The current AppState.
 */
const getState = (): AppState => {
  return zustandStore.getState();
};

/**
 * Retrieves the initial state of the store.
 * @returns The initial AppState.
 */
const getInitialState = (): AppState => {
  return initialState;
};

/**
 * Sets the store's state.
 * @param partial A partial AppState object, or a function that takes the current AppState and returns a new or partial AppState.
 * @param replace Optional boolean. If true, the state is replaced; otherwise, it's merged.
 */
const setState = (
  partial:
    | AppState
    | Partial<AppState>
    | ((state: AppState) => AppState | Partial<AppState>),
  replace?: boolean,
): void => {
  if (replace === true) {
    zustandStore.setState(
      partial as AppState | ((s: AppState) => AppState),
      true,
    );
  } else {
    zustandStore.setState(partial, false); // Or simply pass `replace` which could be undefined
  }
};

/**
 * Subscribes to state changes in the store.
 * @param listener A function that will be called with the new state and previous state upon changes.
 * @returns An unsubscribe function.
 */
const subscribe: Subscribe = listener => {
  return zustandStore.subscribe(listener);
};

// Store initialization state
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;
let lastError: Error | null = null;

/**
 * Initialize the main store with proper type safety
 */
const initialize = async (): Promise<void> => {
  if (isInitialized) {
    return;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      // Initialize store with default state
      zustandStore.setState(initialState, true);

      isInitialized = true;
      lastError = null;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;
      isInitialized = false;
      throw err;
    } finally {
      initializationPromise = null;
    }
  })();

  return initializationPromise;
};

/**
 * Ensure the store is initialized before use
 */
const ensureInitialized = async (): Promise<void> => {
  if (isInitialized) {
    return;
  }

  if (initializationPromise) {
    await initializationPromise;
    return;
  }

  await initialize();
};

/**
 * Check if the store is ready for use
 */
const isStoreReady = (): boolean => {
  return isInitialized;
};

/**
 * Get the initialization status of the store
 */
const getInitializationStatus = (): StoreInitializationStatus => {
  return {
    isInitialized,
    isInitializing: initializationPromise !== null,
    lastError,
  };
};

/**
 * Clean up the store state
 */
const cleanup = (): void => {
  isInitialized = false;
  initializationPromise = null;
  lastError = null;

  // Reset to initial state
  zustandStore.setState(initialState, true);
};

/**
 * An object that provides core store operations, conforming to the StoreInterface.
 */
export const mainStore: StoreInterface = {
  getState,
  getInitialState,
  setState,
  subscribe,
  initialize,
  ensureInitialized,
  isStoreReady,
  getInitializationStatus,
  cleanup,
};
