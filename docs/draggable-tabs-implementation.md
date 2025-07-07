# Draggable Tabs Implementation Guide

## Overview

This document outlines the implementation strategy for making browser tabs draggable, allowing users to drop them onto the chat interface to share the tab's DOM, session, and history with the AI assistant.

## Current Architecture

### Tab Management
- **TabBar Component**: `/renderer/src/components/layout/TabBar.tsx`
  - Uses `@sinm/react-chrome-tabs` library
  - Already supports drag-and-drop for reordering
  - Communicates with main process via IPC

- **TabManager**: `/main/browser/tab-manager.ts`
  - Central tab state management
  - Manages WebContentsView instances
  - Handles tab lifecycle and ordering

### Content Extraction
- **CDP Service**: Chrome DevTools Protocol integration
- **Tab Content Service**: Extracts DOM content and converts to markdown
- **Tab Context Orchestrator**: Manages tab aliases and content injection

### Current Tab-to-Chat Flow
1. User types `@alias` in chat
2. Tab Context Orchestrator identifies the tab
3. CDP extracts DOM content
4. Content is converted to markdown
5. Markdown is injected into chat context

## Proposed Implementation

### 1. Enhanced Drag System

#### A. Modify TabBar Component
```typescript
// Add to TabBar.tsx
const handleTabDragStart = (event: React.DragEvent, tab: ChromeTab) => {
  // Set drag data
  event.dataTransfer.setData('application/vibe-tab', JSON.stringify({
    tabKey: tab.id,
    title: tab.title,
    url: tab.url,
    favicon: tab.favicon
  }));
  
  // Set custom drag image
  const dragImage = createTabDragImage(tab);
  event.dataTransfer.setDragImage(dragImage, 0, 0);
  
  // Visual feedback
  event.dataTransfer.effectAllowed = 'copy';
};
```

#### B. Create Custom Drag Image
```typescript
function createTabDragImage(tab: ChromeTab): HTMLElement {
  const dragElement = document.createElement('div');
  dragElement.className = 'tab-drag-preview';
  dragElement.innerHTML = `
    <img src="${tab.favicon}" />
    <span>${tab.title}</span>
    <div class="drag-hint">Drop in chat to share tab content</div>
  `;
  document.body.appendChild(dragElement);
  return dragElement;
}
```

### 2. Drop Zone Implementation

#### A. Modify ChatPage Component
```typescript
// Add to ChatPage.tsx
const handleTabDrop = async (event: React.DragEvent) => {
  event.preventDefault();
  
  const tabData = event.dataTransfer.getData('application/vibe-tab');
  if (!tabData) return;
  
  const tab = JSON.parse(tabData);
  setIsExtractingTab(true);
  
  try {
    // Request tab content from main process
    const content = await window.vibe.tabs.extractTabContent(tab.tabKey);
    
    // Insert into chat
    const tabReference = `@${tab.title} (Full content shared)`;
    handleInputChange(input + '\n' + tabReference);
    
    // Store extracted content for context
    setSharedTabContent({
      tabKey: tab.tabKey,
      content: content
    });
  } catch (error) {
    showError('Failed to extract tab content');
  } finally {
    setIsExtractingTab(false);
  }
};
```

#### B. Visual Drop Feedback
```typescript
const [isDraggingTab, setIsDraggingTab] = useState(false);

const handleDragOver = (event: React.DragEvent) => {
  if (event.dataTransfer.types.includes('application/vibe-tab')) {
    event.preventDefault();
    setIsDraggingTab(true);
  }
};

const handleDragLeave = () => {
  setIsDraggingTab(false);
};
```

### 3. IPC Communication

#### A. New IPC Handlers
```typescript
// In main process
ipcMain.handle('tabs:extract-full-content', async (event, tabKey: string) => {
  const tab = tabManager.getTab(tabKey);
  if (!tab) throw new Error('Tab not found');
  
  // Extract comprehensive content
  const content = await tabContentService.extractFullContent(tabKey, {
    includeDOM: true,
    includeHistory: true,
    includeSession: true,
    includeCookies: false // For privacy
  });
  
  return content;
});
```

#### B. Enhanced Content Extraction
```typescript
async extractFullContent(tabKey: string, options: ExtractOptions) {
  const view = this.viewManager.getView(tabKey);
  const cdp = await this.cdpManager.getSession(view.webContents);
  
  const result = {
    dom: null,
    history: null,
    session: null,
    metadata: {}
  };
  
  if (options.includeDOM) {
    // Get full DOM tree
    const { root } = await cdp.send('DOM.getDocument');
    const { outerHTML } = await cdp.send('DOM.getOuterHTML', {
      nodeId: root.nodeId
    });
    result.dom = this.convertToMarkdown(outerHTML);
  }
  
  if (options.includeHistory) {
    // Get navigation history
    const { currentIndex, entries } = await cdp.send('Page.getNavigationHistory');
    result.history = entries;
    result.metadata.currentHistoryIndex = currentIndex;
  }
  
  if (options.includeSession) {
    // Get session storage and local storage
    const localStorage = await cdp.send('DOMStorage.getDOMStorageItems', {
      storageId: { isLocalStorage: true, securityOrigin: tab.url }
    });
    result.session = { localStorage: localStorage.entries };
  }
  
  return result;
}
```

### 4. Visual Design

#### A. Drag Cursor
```css
.chrome-tab[draggable="true"] {
  cursor: grab;
}

.chrome-tab[draggable="true"]:active {
  cursor: grabbing;
}

.tab-drag-preview {
  position: fixed;
  background: white;
  border: 2px solid #3b82f6;
  border-radius: 8px;
  padding: 8px 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: none;
  z-index: 10000;
}

.tab-drag-preview img {
  width: 16px;
  height: 16px;
}

.drag-hint {
  font-size: 11px;
  color: #6b7280;
  margin-top: 4px;
}
```

#### B. Drop Zone Highlight
```css
.chat-input-section.tab-drop-zone {
  position: relative;
  transition: all 0.2s ease;
}

.chat-input-section.tab-drop-zone.drag-over {
  background: rgba(59, 130, 246, 0.05);
  border: 2px dashed #3b82f6;
  border-radius: 12px;
}

.tab-drop-indicator {
  position: absolute;
  top: -30px;
  left: 50%;
  transform: translateX(-50%);
  background: #3b82f6;
  color: white;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.chat-input-section.drag-over .tab-drop-indicator {
  opacity: 1;
}
```

### 5. User Experience Flow

1. **Initiate Drag**
   - User clicks and holds on a tab
   - Custom drag preview appears showing tab info
   - Cursor changes to "grabbing"

2. **During Drag**
   - Chat input area highlights when hovering
   - "Drop tab here to share content" indicator appears
   - Other tabs shift to show reorder possibility

3. **On Drop**
   - Loading spinner appears in chat
   - Tab content is extracted (DOM, history, session)
   - Content is converted to markdown
   - Chat input is populated with tab reference
   - Full content is attached to the message context

4. **Error Handling**
   - Show clear error messages if extraction fails
   - Gracefully handle locked or sleeping tabs
   - Provide retry option

### 6. Security Considerations

1. **Content Filtering**
   - Never include passwords or sensitive form data
   - Exclude cookies and authentication tokens
   - Sanitize extracted content before sharing

2. **User Consent**
   - Show what data will be shared before extraction
   - Allow users to configure sharing preferences
   - Respect private browsing mode

3. **Data Limits**
   - Cap extracted content size (e.g., 1MB)
   - Truncate large DOM trees intelligently
   - Compress content before sending to chat

### 7. Implementation Phases

#### Phase 1: Basic Drag-and-Drop (2-3 days)
- Enable tab dragging outside tab bar
- Create drop zone in chat interface
- Basic tab content extraction

#### Phase 2: Enhanced Content Extraction (2-3 days)
- Full DOM extraction with CDP
- Navigation history inclusion
- Session storage extraction

#### Phase 3: Polish and UX (1-2 days)
- Custom drag previews
- Smooth animations
- Error handling and edge cases

#### Phase 4: Performance Optimization (1-2 days)
- Content compression
- Async extraction
- Memory management

### 8. Testing Strategy

1. **Unit Tests**
   - Tab drag event handling
   - Content extraction functions
   - IPC message handling

2. **Integration Tests**
   - Full drag-and-drop flow
   - Large content extraction
   - Error scenarios

3. **Performance Tests**
   - Memory usage during extraction
   - UI responsiveness
   - Content size limits

### 9. Alternative Approaches

1. **Context Menu Option**
   - Right-click tab → "Share with AI"
   - Less discoverable but simpler

2. **Dedicated Button**
   - Add "share" icon to each tab
   - Click to send to chat

3. **Keyboard Shortcut**
   - Cmd/Ctrl+Shift+S on active tab
   - Quick for power users

## Conclusion

The proposed implementation leverages existing infrastructure while adding intuitive drag-and-drop functionality. The phased approach allows for incremental development and testing, ensuring a robust and user-friendly feature.

The architecture supports future enhancements like:
- Dragging multiple tabs at once
- Sharing specific page elements
- Real-time tab mirroring in chat
- Historical tab state snapshots