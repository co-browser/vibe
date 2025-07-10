# Omnibox Popover Resize Fix Implementation Plan

## Overview

Fix the omnibox popover to prevent overflow when the window is resized, and implement performant window resize handling using ResizeObserver API.

## Current State Analysis

The omnibox popover currently has issues with window overflow and uses basic window resize event handlers with debouncing. The positioning calculation doesn't properly handle edge cases when the window becomes smaller than the popover.

### Key Discoveries:

- Window resize handling uses 100ms debounce in `useOmniboxOverlay.ts:527-558`
- Position calculation in `updateOverlayPosition` function at `useOmniboxOverlay.ts:374-524`
- ResizeObserver is not currently used in the codebase (opportunity for improvement)
- Existing debounce utilities available at `apps/electron-app/src/main/utils/debounce.ts`
- Overlay manager also handles resize at `overlay-manager.ts:403-407`

## What We're NOT Doing

- Changing the visual design of the omnibox popover
- Modifying the suggestion rendering logic
- Altering the IPC communication between overlay and main window
- Changing the overlay manager's core functionality

## Implementation Approach

Replace window resize event listeners with ResizeObserver for better performance and more accurate element-specific resize detection. Improve the bounds calculation algorithm to ensure the popover always stays within viewport boundaries.

## Phase 1: Add ResizeObserver Hook and Utilities

### Overview

Create a reusable ResizeObserver hook that can be used throughout the application for efficient resize detection.

### Changes Required:

#### 1. Create useResizeObserver Hook

**File**: `apps/electron-app/src/renderer/src/hooks/useResizeObserver.ts`
**Changes**: Create new hook for ResizeObserver functionality

```typescript
import { useEffect, useRef, useCallback, useState } from "react";
import { debounce } from "@/utils/debounce";

export interface ResizeObserverEntry {
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface UseResizeObserverOptions {
  debounceMs?: number;
  disabled?: boolean;
  onResize?: (entry: ResizeObserverEntry) => void;
}

export function useResizeObserver<T extends HTMLElement = HTMLElement>(
  options: UseResizeObserverOptions = {},
) {
  const { debounceMs = 100, disabled = false, onResize } = options;
  const [entry, setEntry] = useState<ResizeObserverEntry | null>(null);
  const elementRef = useRef<T | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const debouncedCallback = useCallback(
    debounce((entry: ResizeObserverEntry) => {
      setEntry(entry);
      onResize?.(entry);
    }, debounceMs),
    [debounceMs, onResize],
  );

  useEffect(() => {
    if (disabled || !elementRef.current) return;

    observerRef.current = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const { x, y } = entry.target.getBoundingClientRect();
        debouncedCallback({ width, height, x, y });
      }
    });

    observerRef.current.observe(elementRef.current);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, [disabled, debouncedCallback]);

  return { elementRef, entry };
}
```

#### 2. Create Debounce Import Helper

**File**: `apps/electron-app/src/renderer/src/utils/debounce.ts`
**Changes**: Create renderer-side debounce utility that imports from main process utils

```typescript
// Re-export debounce utilities for renderer process
export {
  debounce,
  throttle,
  DebounceManager,
} from "../../../main/utils/debounce";
```

### Success Criteria:

#### Automated Verification:

- [ ] TypeScript compilation passes: `npm run typecheck`
- [ ] ESLint passes: `npm run lint`
- [ ] New hook exports properly from hooks directory

#### Manual Verification:

- [ ] ResizeObserver hook can be imported and used in components
- [ ] Debounce utility works correctly in renderer process

---

## Phase 2: Update Omnibox Overlay Position Calculation

### Overview

Improve the position calculation algorithm to handle viewport bounds properly and prevent overflow.

### Changes Required:

#### 1. Enhanced Position Calculation

**File**: `apps/electron-app/src/renderer/src/hooks/useOmniboxOverlay.ts`
**Changes**: Update the `updateOverlayPosition` function with better bounds checking

```typescript
// Replace the updateOverlayPosition function (lines 374-524)
const updateOverlayPosition = useCallback(() => {
  if (!window.electron?.ipcRenderer || overlayStatus !== "enabled") return;

  const omnibarContainer = document.querySelector(".omnibar-container");
  if (!omnibarContainer) {
    logger.debug("Omnibar container not found, using fallback positioning");
    applyFallbackPositioning();
    return;
  }

  // Check if container is visible
  const containerRect = omnibarContainer.getBoundingClientRect();
  if (containerRect.width === 0 || containerRect.height === 0) {
    logger.debug(
      "Omnibar container has zero dimensions, using fallback positioning",
    );
    applyFallbackPositioning();
    return;
  }

  try {
    const rect = omnibarContainer.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const maxDropdownHeight = 300;
    const minMargin = 12;
    const minDropdownWidth = 300;

    // Calculate horizontal positioning
    let overlayWidth = Math.max(rect.width, minDropdownWidth);
    let leftPosition = rect.left;

    // Ensure dropdown doesn't exceed window width
    const availableWidth = windowWidth - minMargin * 2;
    if (overlayWidth > availableWidth) {
      overlayWidth = availableWidth;
      leftPosition = minMargin;
    } else {
      // Center align if omnibar is narrower than dropdown
      if (rect.width < overlayWidth) {
        const offset = (overlayWidth - rect.width) / 2;
        leftPosition = rect.left - offset;
      }

      // Adjust if dropdown would go off right edge
      if (leftPosition + overlayWidth > windowWidth - minMargin) {
        leftPosition = windowWidth - overlayWidth - minMargin;
      }

      // Adjust if dropdown would go off left edge
      if (leftPosition < minMargin) {
        leftPosition = minMargin;
      }
    }

    // Calculate vertical positioning
    let topPosition = rect.bottom;
    let dropdownHeight = maxDropdownHeight;

    // Check available space below
    const spaceBelow = windowHeight - rect.bottom - minMargin;
    const spaceAbove = rect.top - minMargin;

    // Position above if not enough space below and more space above
    let positionAbove = false;
    if (spaceBelow < 100 && spaceAbove > spaceBelow) {
      positionAbove = true;
      dropdownHeight = Math.min(maxDropdownHeight, spaceAbove);
      topPosition = rect.top - dropdownHeight;
    } else {
      // Position below with adjusted height if needed
      dropdownHeight = Math.min(maxDropdownHeight, spaceBelow);
    }

    // Apply positioning with minimal script
    const updateScript = `
      (function() {
        try {
          const overlay = document.querySelector('.omnibox-dropdown');
          if (overlay) {
            overlay.style.position = 'fixed';
            overlay.style.left = '${leftPosition}px';
            overlay.style.top = '${topPosition}px';
            overlay.style.width = '${overlayWidth}px';
            overlay.style.maxWidth = '${overlayWidth}px';
            overlay.style.maxHeight = '${dropdownHeight}px';
            overlay.style.zIndex = '2147483647';
            overlay.style.transform = 'none';
            overlay.style.borderRadius = '${positionAbove ? "12px 12px 0 0" : "0 0 12px 12px"}';
          }
        } catch (error) {
          // Continue silently on error
        }
      })();
    `;

    window.electron.ipcRenderer
      .invoke("overlay:execute", updateScript)
      .catch(error => {
        logger.debug(
          "Overlay positioning script failed, using fallback:",
          error.message,
        );
        applyFallbackPositioning();
      });
  } catch (error) {
    logger.error("Error in overlay positioning calculation:", error);
    applyFallbackPositioning();
  }

  // Enhanced fallback positioning
  function applyFallbackPositioning() {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const minMargin = 20;
    const maxDropdownWidth = 600;
    const maxDropdownHeight = 300;

    const fallbackWidth = Math.min(
      maxDropdownWidth,
      windowWidth - minMargin * 2,
    );
    const fallbackLeft = Math.max(minMargin, (windowWidth - fallbackWidth) / 2);
    const fallbackTop = Math.min(80, windowHeight / 4);
    const fallbackHeight = Math.min(
      maxDropdownHeight,
      windowHeight - fallbackTop - minMargin,
    );

    const fallbackScript = `
      (function() {
        try {
          const overlay = document.querySelector('.omnibox-dropdown');
          if (overlay) {
            overlay.style.position = 'fixed';
            overlay.style.left = '${fallbackLeft}px';
            overlay.style.top = '${fallbackTop}px';
            overlay.style.width = '${fallbackWidth}px';
            overlay.style.maxWidth = '${fallbackWidth}px';
            overlay.style.maxHeight = '${fallbackHeight}px';
            overlay.style.zIndex = '2147483647';
          }
        } catch (error) {
          // Continue silently on error
        }
      })();
    `;

    window.electron.ipcRenderer
      .invoke("overlay:execute", fallbackScript)
      .catch(error =>
        logger.debug(
          "Fallback overlay positioning also failed:",
          error.message,
        ),
      );
  }
}, [overlayStatus]);
```

### Success Criteria:

#### Automated Verification:

- [ ] TypeScript compilation passes: `npm run typecheck`
- [ ] ESLint passes: `npm run lint`

#### Manual Verification:

- [ ] Popover stays within viewport bounds when window is resized
- [ ] Popover appears above omnibox when not enough space below
- [ ] Popover width adjusts when window is too narrow
- [ ] Fallback positioning works when omnibar container not found

---

## Phase 3: Implement ResizeObserver for Window and Element Monitoring

### Overview

Replace window resize event listeners with ResizeObserver for better performance.

### Changes Required:

#### 1. Update useOmniboxOverlay Hook

**File**: `apps/electron-app/src/renderer/src/hooks/useOmniboxOverlay.ts`
**Changes**: Replace window resize listener with ResizeObserver

```typescript
// Add import at the top
import { useResizeObserver } from "./useResizeObserver";

// Replace the window resize listener (lines 527-558) with:
// Monitor window resize using ResizeObserver on document.body
const { elementRef: bodyRef } = useResizeObserver<HTMLBodyElement>({
  debounceMs: 100,
  onResize: () => {
    updateOverlayPosition();
  },
});

// Set body ref on mount
useEffect(() => {
  bodyRef.current = document.body;
}, []);

// Monitor omnibar container resize
const { elementRef: omnibarRef } = useResizeObserver<HTMLDivElement>({
  debounceMs: 50, // Faster response for element resize
  onResize: () => {
    updateOverlayPosition();
  },
});

// Set omnibar ref when available
useEffect(() => {
  const omnibarContainer = document.querySelector(
    ".omnibar-container",
  ) as HTMLDivElement;
  if (omnibarContainer) {
    omnibarRef.current = omnibarContainer;
  }
}, []);

// Also update position when overlay becomes visible
useEffect(() => {
  if (overlayStatus === "enabled") {
    updateOverlayPosition();
  }
}, [updateOverlayPosition, overlayStatus]);
```

#### 2. Update Overlay Manager Window Resize Handling

**File**: `apps/electron-app/src/main/browser/overlay-manager.ts`
**Changes**: Improve resize handling in the main process

```typescript
// Update the resize handler (lines 403-407) to use the existing debounce utility
import { debounce } from '../utils/debounce';

// In the initialize method, replace the resize handler with:
const debouncedUpdateBounds = debounce(() => this.updateBounds(), 100);
this.window.on('resize', debouncedUpdateBounds);

// Store the debounced function for cleanup
private debouncedUpdateBounds: (() => void) | null = null;

// In the destroy method, clean up the listener:
if (this.debouncedUpdateBounds) {
  this.window.off('resize', this.debouncedUpdateBounds);
}
```

### Success Criteria:

#### Automated Verification:

- [ ] TypeScript compilation passes: `npm run typecheck`
- [ ] ESLint passes: `npm run lint`
- [ ] No memory leaks from ResizeObserver

#### Manual Verification:

- [ ] Popover repositions smoothly during window resize
- [ ] Performance is better than previous implementation
- [ ] No visual glitches during rapid resizing
- [ ] ResizeObserver properly disconnects on component unmount

---

## Phase 4: Add Visual Polish and Edge Case Handling

### Overview

Add smooth transitions and handle edge cases for better user experience.

### Changes Required:

#### 1. Add CSS Transitions

**File**: `apps/electron-app/src/renderer/src/hooks/useOmniboxOverlay.ts`
**Changes**: Update the STATIC_CSS to include smooth transitions

```css
// Add to STATIC_CSS (line 42)
.vibe-overlay-interactive.omnibox-dropdown {
  /* ... existing styles ... */
  /* Add smooth position transitions */
  transition:
    max-height 0.2s ease-out,
    transform 0.15s ease-out,
    border-radius 0.2s ease-out;
}

/* Add class for position above */
.vibe-overlay-interactive.omnibox-dropdown.position-above {
  border-radius: 12px 12px 0 0;
  transform-origin: bottom center;
}

/* Add class for constrained width */
.vibe-overlay-interactive.omnibox-dropdown.width-constrained {
  border-radius: 8px;
}
```

#### 2. Handle Rapid Resize Events

**File**: `apps/electron-app/src/renderer/src/hooks/useOmniboxOverlay.ts`
**Changes**: Add operation tracking to prevent race conditions during rapid resizing

```typescript
// Add ref for tracking resize operations
const resizeOperationRef = useRef<number>(0);

// Update the updateOverlayPosition function to include operation tracking
const updateOverlayPosition = useCallback(() => {
  if (!window.electron?.ipcRenderer || overlayStatus !== "enabled") return;

  // Increment operation counter
  const operationId = ++resizeOperationRef.current;

  // ... existing positioning logic ...

  // Before applying positioning, check if this is still the latest operation
  if (operationId !== resizeOperationRef.current) {
    return; // Skip if a newer resize operation has started
  }

  // ... apply positioning ...
}, [overlayStatus]);
```

### Success Criteria:

#### Automated Verification:

- [ ] CSS syntax is valid
- [ ] TypeScript compilation passes: `npm run typecheck`
- [ ] ESLint passes: `npm run lint`

#### Manual Verification:

- [ ] Smooth transitions when popover changes position
- [ ] No flickering during rapid window resizing
- [ ] Popover maintains proper styling in all positions
- [ ] Race conditions prevented during rapid resizing

---

## Testing Strategy

### Unit Tests:

- Test bounds calculation logic with various window and element sizes
- Test ResizeObserver hook cleanup
- Test debounce functionality

### Integration Tests:

- Test popover positioning in different window sizes
- Test rapid window resizing scenarios
- Test with different screen resolutions

### Manual Testing Steps:

1. Open omnibox and resize window to very small width - popover should stay within bounds
2. Open omnibox at bottom of screen - popover should appear above
3. Rapidly resize window - no flickering or positioning errors
4. Test on different screen sizes and resolutions
5. Test with browser zoom at different levels

## Performance Considerations

- ResizeObserver is more efficient than window resize events
- Debouncing prevents excessive recalculations
- Operation tracking prevents race conditions
- CSS transitions handled by GPU for smooth animations

## Migration Notes

- No data migration required
- Backward compatible - falls back gracefully if ResizeObserver not supported
- Can be deployed without user-facing changes except improved behavior

## References

- Similar ResizeObserver implementation: Consider patterns from draggable divider components
- Debounce utility: `apps/electron-app/src/main/utils/debounce.ts`
- Current implementation: `apps/electron-app/src/renderer/src/hooks/useOmniboxOverlay.ts:374-558`
