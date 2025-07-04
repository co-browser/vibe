import { createStore } from "zustand/vanilla";
import { AppState } from "./types";

export const initialState: AppState = {
  messages: [],
  requestedTabContext: [],
  sessionTabs: [],
  downloads: [],
  // ❌ Remove: websiteContexts: [], (now handled by MCP)
};

// The store manages AppState. Actions are not part of the state object itself.
export const store = createStore<AppState>()(
  () =>
    ({
      ...initialState,
    }) satisfies AppState,
);
