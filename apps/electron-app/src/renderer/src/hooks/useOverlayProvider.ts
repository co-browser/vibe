/**
 * Hook to use the OverlayProvider context
 */

import { useContext } from "react";
import { OverlayContext } from "../contexts/OverlayContext";

// Hook to use overlay
export function useOverlayProvider() {
  const context = useContext(OverlayContext);
  if (!context) {
    throw new Error("useOverlayProvider must be used within OverlayProvider");
  }
  return context;
}
