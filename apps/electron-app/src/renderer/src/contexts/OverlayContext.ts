/**
 * Overlay Context
 * Shared context for overlay management
 */

import { createContext } from "react";

export interface OverlayPosition {
  preset?:
    | "center"
    | "top"
    | "bottom"
    | "top-right"
    | "top-left"
    | "bottom-right"
    | "bottom-left";
  custom?: { top?: string; left?: string; right?: string; bottom?: string };
  anchor?: DOMRect; // For anchoring to elements
}

export interface OverlayOptions {
  id?: string;
  className?: string;
  style?: React.CSSProperties;
  position?: OverlayPosition;
  animate?: boolean;
  animationDuration?: number;
  dismissOnClickOutside?: boolean;
  dismissOnEscape?: boolean;
  autoHide?: number;
  priority?: "low" | "normal" | "high";
  preserveOnRouteChange?: boolean;
  onShow?: () => void;
  onHide?: () => void;
}

export interface OverlayItem {
  id: string;
  content: React.ReactElement;
  options: OverlayOptions;
  timestamp: number;
}

export interface OverlayContextType {
  show: (content: React.ReactElement, options?: OverlayOptions) => string;
  hide: (id?: string) => void;
  hideAll: () => void;
  update: (id: string, content: React.ReactElement) => void;
  isVisible: (id?: string) => boolean;
  activeOverlays: OverlayItem[];
}

// Context
export const OverlayContext = createContext<OverlayContextType | null>(null);
