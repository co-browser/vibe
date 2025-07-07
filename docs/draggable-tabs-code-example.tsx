// Example implementation of draggable tabs feature
// This code demonstrates the key components needed

// ============================================
// 1. Enhanced TabBar Component (TabBar.tsx)
// ============================================

import React, { useCallback } from 'react';
import { Tabs, TabProperties } from '@sinm/react-chrome-tabs';

interface EnhancedTabBarProps {
  tabs: ChromeTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  onTabReorder: (tabId: string, fromIndex: number, toIndex: number) => void;
  onTabClose: (tabId: string) => void;
}

export const EnhancedTabBar: React.FC<EnhancedTabBarProps> = ({
  tabs,
  activeTab,
  onTabChange,
  onTabReorder,
  onTabClose,
}) => {
  // Create custom drag preview element
  const createDragPreview = useCallback((tab: ChromeTab) => {
    const preview = document.createElement('div');
    preview.className = 'tab-drag-preview';
    preview.innerHTML = `
      <img src="${tab.favicon || '/default-favicon.png'}" alt="" />
      <span>${tab.title || 'Untitled'}</span>
      <div class="drag-hint">Drop in chat to share full page content</div>
    `;
    
    // Style the preview
    Object.assign(preview.style, {
      position: 'fixed',
      left: '-1000px',
      top: '-1000px',
      zIndex: '10000',
    });
    
    document.body.appendChild(preview);
    return preview;
  }, []);

  // Handle drag start - package tab data
  const handleDragStart = useCallback((event: React.DragEvent, tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    // Set drag data with tab information
    const tabData = {
      tabKey: tab.id,
      title: tab.title,
      url: tab.url,
      favicon: tab.favicon,
      timestamp: Date.now(),
    };
    
    event.dataTransfer.setData('application/vibe-tab', JSON.stringify(tabData));
    event.dataTransfer.effectAllowed = 'copy';
    
    // Create and set custom drag image
    const preview = createDragPreview(tab);
    event.dataTransfer.setDragImage(preview, 0, 0);
    
    // Clean up preview after drag
    setTimeout(() => preview.remove(), 0);
    
    // Add dragging class to body for global cursor change
    document.body.classList.add('dragging-tab');
  }, [tabs, createDragPreview]);

  // Handle drag end - cleanup
  const handleDragEnd = useCallback(() => {
    document.body.classList.remove('dragging-tab');
  }, []);

  return (
    <div className="enhanced-tab-bar">
      <Tabs
        tabs={tabs}
        value={activeTab}
        onTabClick={onTabChange}
        onTabReorder={onTabReorder}
        onTabClose={onTabClose}
        draggable={true}
        // Override drag handlers for custom behavior
        tabProperties={(tabId: string): TabProperties => ({
          onDragStart: (e) => handleDragStart(e, tabId),
          onDragEnd: handleDragEnd,
        })}
      />
    </div>
  );
};

// ============================================
// 2. Enhanced ChatPage Component (ChatPage.tsx)
// ============================================

interface TabDropData {
  tabKey: string;
  title: string;
  url: string;
  favicon?: string;
  timestamp: number;
}

interface ExtractedTabContent {
  dom: string;
  history: NavigationEntry[];
  session: SessionData;
  metadata: {
    extractedAt: number;
    url: string;
    title: string;
  };
}

export function EnhancedChatPage() {
  const [isDraggingTab, setIsDraggingTab] = useState(false);
  const [isExtractingContent, setIsExtractingContent] = useState(false);
  const [droppedTabContent, setDroppedTabContent] = useState<ExtractedTabContent | null>(null);
  
  // Handle drag over - check if it's a tab being dragged
  const handleDragOver = useCallback((event: React.DragEvent) => {
    if (event.dataTransfer.types.includes('application/vibe-tab')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setIsDraggingTab(true);
    }
  }, []);

  // Handle drag leave
  const handleDragLeave = useCallback((event: React.DragEvent) => {
    // Check if we're leaving the drop zone entirely
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX;
    const y = event.clientY;
    
    if (x <= rect.left || x >= rect.right || y <= rect.top || y >= rect.bottom) {
      setIsDraggingTab(false);
    }
  }, []);

  // Handle tab drop
  const handleDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault();
    setIsDraggingTab(false);
    
    const tabDataStr = event.dataTransfer.getData('application/vibe-tab');
    if (!tabDataStr) return;
    
    try {
      const tabData: TabDropData = JSON.parse(tabDataStr);
      setIsExtractingContent(true);
      
      // Show immediate feedback
      const tempMessage = `Extracting content from "${tabData.title}"...`;
      handleInputValueChange(tempMessage);
      
      // Request full tab content from main process
      const extractedContent = await window.vibe.tabs.extractFullTabContent(tabData.tabKey, {
        includeDOM: true,
        includeHistory: true,
        includeSession: true,
        maxDOMDepth: 10,
        maxHistoryItems: 50,
      });
      
      // Store the extracted content
      setDroppedTabContent(extractedContent);
      
      // Create a reference message
      const referenceMessage = `I've shared the complete content of "${tabData.title}" with you. ` +
        `This includes the full page content, navigation history, and session data. ` +
        `How can I help you with this page?`;
      
      handleInputValueChange(referenceMessage);
      
      // Optionally auto-send the message
      // setTimeout(() => handleSend(), 100);
      
    } catch (error) {
      console.error('Failed to extract tab content:', error);
      showError('Failed to extract tab content. Please try again.');
    } finally {
      setIsExtractingContent(false);
    }
  }, [handleInputValueChange, showError]);

  return (
    <div 
      className={`chat-container ${isDraggingTab ? 'tab-drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Existing chat UI */}
      <Messages />
      
      {/* Drop indicator overlay */}
      {isDraggingTab && (
        <div className="tab-drop-overlay">
          <div className="tab-drop-indicator">
            <TabIcon className="drop-icon" />
            <span>Drop tab here to share its content</span>
          </div>
        </div>
      )}
      
      {/* Extraction loading state */}
      {isExtractingContent && (
        <div className="extraction-overlay">
          <Spinner />
          <span>Extracting tab content...</span>
        </div>
      )}
      
      {/* Enhanced chat input with tab content indicator */}
      <div className="chat-input-section">
        {droppedTabContent && (
          <div className="shared-tab-indicator">
            <img src={droppedTabContent.metadata.favicon} alt="" />
            <span>Sharing: {droppedTabContent.metadata.title}</span>
            <button onClick={() => setDroppedTabContent(null)}>×</button>
          </div>
        )}
        <ChatInput />
      </div>
    </div>
  );
}

// ============================================
// 3. Main Process Handler (tab-content-extractor.ts)
// ============================================

import { ipcMain } from 'electron';
import { CDPSession } from 'electron';

interface ExtractionOptions {
  includeDOM: boolean;
  includeHistory: boolean;
  includeSession: boolean;
  maxDOMDepth?: number;
  maxHistoryItems?: number;
}

export class TabContentExtractor {
  constructor(
    private tabManager: TabManager,
    private cdpManager: CDPManager,
    private viewManager: ViewManager
  ) {
    this.setupIpcHandlers();
  }

  private setupIpcHandlers() {
    ipcMain.handle('tabs:extract-full-content', async (event, tabKey: string, options: ExtractionOptions) => {
      return this.extractFullTabContent(tabKey, options);
    });
  }

  async extractFullTabContent(tabKey: string, options: ExtractionOptions) {
    const tab = this.tabManager.getTab(tabKey);
    if (!tab) {
      throw new Error(`Tab ${tabKey} not found`);
    }

    const view = this.viewManager.getView(tabKey);
    if (!view) {
      throw new Error(`View for tab ${tabKey} not found`);
    }

    const cdp = await this.cdpManager.getSession(view.webContents);
    const result: ExtractedTabContent = {
      dom: '',
      history: [],
      session: {},
      metadata: {
        extractedAt: Date.now(),
        url: tab.url,
        title: tab.title,
      },
    };

    // Extract DOM content
    if (options.includeDOM) {
      result.dom = await this.extractDOM(cdp, options.maxDOMDepth);
    }

    // Extract navigation history
    if (options.includeHistory) {
      result.history = await this.extractHistory(cdp, options.maxHistoryItems);
    }

    // Extract session data
    if (options.includeSession) {
      result.session = await this.extractSessionData(cdp, tab.url);
    }

    return result;
  }

  private async extractDOM(cdp: CDPSession, maxDepth = 10): Promise<string> {
    // Get the full DOM
    const { root } = await cdp.send('DOM.getDocument', {
      depth: maxDepth,
      pierce: true,
    });

    // Get outer HTML
    const { outerHTML } = await cdp.send('DOM.getOuterHTML', {
      nodeId: root.nodeId,
    });

    // Convert to markdown for better AI processing
    return this.htmlToMarkdown(outerHTML);
  }

  private async extractHistory(cdp: CDPSession, maxItems = 50): Promise<NavigationEntry[]> {
    const { currentIndex, entries } = await cdp.send('Page.getNavigationHistory');
    
    // Get recent history around current position
    const startIdx = Math.max(0, currentIndex - Math.floor(maxItems / 2));
    const endIdx = Math.min(entries.length, startIdx + maxItems);
    
    return entries.slice(startIdx, endIdx).map(entry => ({
      url: entry.url,
      title: entry.title,
      timestamp: entry.timestamp,
      isCurrent: entries[currentIndex].id === entry.id,
    }));
  }

  private async extractSessionData(cdp: CDPSession, url: string): Promise<SessionData> {
    const origin = new URL(url).origin;
    
    // Get localStorage
    const localStorage = await cdp.send('DOMStorage.getDOMStorageItems', {
      storageId: {
        securityOrigin: origin,
        isLocalStorage: true,
      },
    });

    // Get sessionStorage
    const sessionStorage = await cdp.send('DOMStorage.getDOMStorageItems', {
      storageId: {
        securityOrigin: origin,
        isLocalStorage: false,
      },
    });

    // Filter out sensitive data
    const filterSensitiveData = (items: Array<[string, string]>) => {
      return items.filter(([key]) => {
        const lowercaseKey = key.toLowerCase();
        return !lowercaseKey.includes('token') &&
               !lowercaseKey.includes('password') &&
               !lowercaseKey.includes('secret') &&
               !lowercaseKey.includes('auth');
      });
    };

    return {
      localStorage: Object.fromEntries(filterSensitiveData(localStorage.entries)),
      sessionStorage: Object.fromEntries(filterSensitiveData(sessionStorage.entries)),
      origin,
    };
  }

  private htmlToMarkdown(html: string): string {
    // Use a library like turndown or implement custom conversion
    // This is a simplified example
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

// ============================================
// 4. CSS Styles (draggable-tabs.css)
// ============================================

// CSS styles for draggable tabs (to be saved as draggable-tabs.css):
// ```css
// .tab-drag-preview {
//   background: white;
//   border: 2px solid #3b82f6;
//   border-radius: 8px;
//   padding: 8px 12px;
//   box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
//   display: flex;
//   flex-direction: column;
//   align-items: center;
//   gap: 4px;
//   max-width: 200px;
// }
// 
// .tab-drag-preview img {
//   width: 24px;
//   height: 24px;
// }
// 
// .tab-drag-preview span {
//   font-size: 13px;
//   font-weight: 500;
//   color: #1f2937;
//   text-overflow: ellipsis;
//   overflow: hidden;
//   white-space: nowrap;
//   max-width: 100%;
// }
// 
// .drag-hint {
//   font-size: 11px;
//   color: #6b7280;
// }
// 
// /* Global cursor when dragging tab */
// body.dragging-tab {
//   cursor: grabbing !important;
// }
// 
// body.dragging-tab * {
//   cursor: grabbing !important;
// }
// 
// /* Chat container drop states */
// .chat-container {
//   transition: background-color 0.2s ease;
// }
// 
// .chat-container.tab-drag-over {
//   background-color: rgba(59, 130, 246, 0.03);
// }
// 
// /* Tab drop overlay */
// .tab-drop-overlay {
//   position: absolute;
//   inset: 0;
//   display: flex;
//   align-items: center;
//   justify-content: center;
//   background: rgba(59, 130, 246, 0.05);
//   border: 3px dashed #3b82f6;
//   border-radius: 12px;
//   pointer-events: none;
//   animation: fadeIn 0.2s ease;
// }
// 
// .tab-drop-indicator {
//   background: white;
//   border: 2px solid #3b82f6;
//   border-radius: 12px;
//   padding: 24px 32px;
//   display: flex;
//   flex-direction: column;
//   align-items: center;
//   gap: 12px;
//   box-shadow: 0 8px 32px rgba(59, 130, 246, 0.2);
// }
// 
// .drop-icon {
//   width: 48px;
//   height: 48px;
//   color: #3b82f6;
// }
// 
// .tab-drop-indicator span {
//   font-size: 16px;
//   font-weight: 600;
//   color: #1f2937;
// }
// 
// /* Extraction loading overlay */
// .extraction-overlay {
//   position: absolute;
//   inset: 0;
//   background: rgba(255, 255, 255, 0.9);
//   display: flex;
//   flex-direction: column;
//   align-items: center;
//   justify-content: center;
//   gap: 16px;
//   z-index: 100;
// }
// 
// /* Shared tab indicator */
// .shared-tab-indicator {
//   display: flex;
//   align-items: center;
//   gap: 8px;
//   padding: 8px 12px;
//   background: #f3f4f6;
//   border-radius: 8px;
//   margin-bottom: 8px;
// }
// 
// .shared-tab-indicator img {
//   width: 16px;
//   height: 16px;
// }
// 
// .shared-tab-indicator span {
//   font-size: 13px;
//   color: #6b7280;
// }
// 
// .shared-tab-indicator button {
//   margin-left: auto;
//   background: none;
//   border: none;
//   color: #9ca3af;
//   cursor: pointer;
//   font-size: 18px;
//   line-height: 1;
//   padding: 0 4px;
// }
// 
// .shared-tab-indicator button:hover {
//   color: #ef4444;
// }
// 
// @keyframes fadeIn {
//   from {
//     opacity: 0;
//   }
//   to {
//     opacity: 1;
//   }
// }
// ```