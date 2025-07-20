/**
 * Context Menu Context
 * Provides the context for context menu actions
 */

import { createContext } from "react";

export interface ContextMenuContextValue {
  handleTabAction: (actionId: string, data?: any) => void;
  handleNavigationAction: (actionId: string, data?: any) => void;
  handleChatAction: (actionId: string, data?: any) => void;
}

export const ContextMenuContext = createContext<ContextMenuContextValue | null>(
  null,
);
