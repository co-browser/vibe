import React from "react";
import { LayoutContextType } from "@vibe/shared-types";

export const LayoutContext = React.createContext<LayoutContextType | null>(
  null,
);

export function useLayout(): LayoutContextType {
  const context = React.useContext(LayoutContext);
  if (!context) {
    throw new Error("useLayout must be used within a LayoutProvider");
  }
  return context;
}
