# Context Menu System Implementation

This document describes the comprehensive right-click context menu system implemented for Vibe Browser.

## Overview

The context menu system provides different menus based on where the user right-clicks:

- **Browser UI**: Navigation, page actions, developer tools
- **Tab Bar**: Tab management actions
- **Chat View**: Chat-specific actions

## Architecture

### Main Process Components

1. **ContextMenuService** (`src/main/services/context-menu-service.ts`)
   - Singleton service that manages context menu creation and display
   - Determines menu type and builds appropriate menu templates
   - Handles menu popup positioning

2. **ContextMenuActionHandler** (`src/main/services/context-menu-actions.ts`)
   - Handles execution of context menu actions
   - Routes actions to appropriate handlers (browser, tab, chat)
   - Provides fallback implementations for placeholder features

3. **IPC Actions Handler** (`src/main/ipc/app/actions.ts`)
   - Updated to use the new context menu service
   - Handles `actions:show-context-menu` IPC calls

### Renderer Process Components

1. **ContextMenuDetector** (`src/renderer/src/components/ui/context-menu-detector.tsx`)
   - React component that wraps the main application
   - Detects right-click events and determines context type
   - Gathers element information (input fields, links, selected text)
   - Sends context menu requests to main process

2. **Data Attributes**
   - Added `data-context` attributes to identify different UI areas:
     - `data-context="tab"` for tab bar elements
     - `data-context="chat"` for chat interface elements
     - Browser UI uses default context

## Context Menu Types

### Browser Context Menu
Shown when right-clicking in the browser view area:

- **Navigation**: Back, Forward, Reload
- **Page Actions**: Save As, Search, Send to Devices, Translate
- **Developer Tools**: VisBug, View Page Source
- **Conditional Items**:
  - "Fix Text" (when clicking on input fields)
  - "Open Link in New Tab" / "Copy Link Address" (when clicking on links)

### Tab Context Menu
Shown when right-clicking on tabs or tab bar:

- New Tab to the Right
- Reload
- Duplicate
- Pin
- Mute Site
- Smart Close All...

### Chat Context Menu
Shown when right-clicking in the chat interface:

- Chat History
- Suggestions
- Account

## Implementation Details

### Context Detection

The `ContextMenuDetector` uses CSS selectors to determine context:

```typescript
const determineMenuType = (target: HTMLElement): "browser" | "tab" | "chat" => {
  // Check for chat context
  if (target.closest('[data-context="chat"]') || 
      target.closest('.chat-panel') || 
      target.closest('.chat-view')) {
    return "chat";
  }

  // Check for tab context
  if (target.closest('[data-context="tab"]') || 
      target.closest('.tab-bar') || 
      target.closest('.tab-item')) {
    return "tab";
  }

  // Default to browser context
  return "browser";
};
```

### Element Information Gathering

The detector automatically gathers contextual information:

- **Input Detection**: Checks for input fields, textareas, contenteditable elements
- **Link Detection**: Finds parent anchor elements and extracts URLs
- **Text Selection**: Captures selected text for search functionality
- **Navigation State**: Gets current tab's back/forward/loading state

### Action Routing

Actions are routed through the IPC system:

1. User right-clicks → `ContextMenuDetector` captures event
2. Detector sends context menu request via IPC
3. `ContextMenuService` creates and shows menu
4. User clicks menu item → Action handler executes
5. Action handler sends commands back to renderer or handles directly

## Integration

### App Component Integration

The `ContextMenuDetector` wraps the main browser application:

```tsx
// Only for main browser window, not popup windows
return (
  <ContextMenuDetector>
    <RouterProvider>
      <Route>
        <BrowserRoute />
      </Route>
    </RouterProvider>
  </ContextMenuDetector>
);
```

### Component Markup

Components include `data-context` attributes for proper detection:

```tsx
// Tab bar
<div className="custom-tab-bar-wrapper" data-context="tab">

// Chat interface
<div className="chat-container" data-context="chat">
```

## Action Implementations

### Browser Actions

- **Navigation**: Uses existing vibe API for back/forward/reload
- **Save As**: Shows native save dialog and triggers page save
- **Search**: Opens new tab with search query
- **Translate**: Placeholder for future translation feature
- **VisBug**: Placeholder for VisBug integration
- **View Source**: Placeholder for view source feature
- **Fix Text**: Placeholder for AI text correction

### Tab Actions

- **New Tab to Right**: Creates tab adjacent to current tab
- **Reload/Duplicate**: Uses existing tab management APIs
- **Pin/Mute**: Placeholder implementations
- **Smart Close All**: Shows confirmation dialog before closing unpinned tabs

### Chat Actions

- **History/Suggestions/Account**: Send events to chat interface for handling

## Future Enhancements

1. **Dynamic Menu Items**: Enable/disable items based on current state
2. **Keyboard Shortcuts**: Add accelerator keys to menu items
3. **Submenu Support**: Add nested menus for complex actions
4. **Custom Icons**: Add icons to menu items for better UX
5. **Plugin System**: Allow extensions to add custom menu items

## Testing

To test the context menu system:

1. Right-click in different areas of the application
2. Verify correct menu appears for each context
3. Test menu items execute appropriate actions
4. Verify conditional items appear/disappear correctly
5. Test with different element types (inputs, links, text selection)

## Error Handling

The system includes comprehensive error handling:

- Graceful fallbacks when APIs are unavailable
- Logging for debugging context menu issues
- Safe defaults for missing window/tab information
- Prevention of context menu on popup windows