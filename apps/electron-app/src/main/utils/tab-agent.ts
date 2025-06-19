/**
 * Tab to Agent utility
 * Handles sending tab content to the agent service
 */

import {
  CDPConnector,
  getCurrentPageContent,
  extractTextFromPageContent,
} from "@vibe/tab-extraction-core";
import { Browser } from "@/browser/browser";
import { BrowserWindow } from "electron";
import { createLogger } from "@vibe/shared-types";
import type { IAgentProvider } from "@vibe/shared-types";

const logger = createLogger("tab-agent");

// Global reference to the agent service instance
// This will be set by the main process during initialization
let agentServiceInstance: IAgentProvider | null = null;

/**
 * Set the agent service instance (called by main process)
 */
export function setAgentServiceInstance(service: IAgentProvider): void {
  agentServiceInstance = service;
}

/**
 * Get the current agent service instance
 */
function getAgentService(): IAgentProvider | null {
  return agentServiceInstance;
}

/**
 * Sends the active tab content to the agent service
 */
export async function sendTabToAgent(browser: Browser): Promise<void> {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (!focusedWindow) {
    logger.error("No focused window available");
    return;
  }

  const appWindow = browser.getApplicationWindow(focusedWindow.webContents.id);
  if (!appWindow) {
    logger.error("No application window found for focused window");
    return;
  }

  const tabManager = appWindow.tabManager;
  const browserViewManager = appWindow.viewManager;
  const cdpManager = browser.getCDPManager();

  if (!tabManager || !browserViewManager || !cdpManager) {
    logger.error("Required managers not available");
    return;
  }

  // Get the active tab key from TabManager
  const checkKey = tabManager.getActiveTabKey();
  if (checkKey === undefined || checkKey === null) {
    logger.info("No active tab available to send to agent");
    return;
  }

  // Get the current tab's information using ViewManager API
  const activeView = browserViewManager?.getView(checkKey);
  if (!activeView?.webContents) {
    logger.error(`No active view webContents found for tab: ${checkKey}`);
    return;
  }

  const tabUrl = activeView.webContents.getURL() || "Unknown URL";
  const tabTitle = activeView.webContents.getTitle() || "Unknown Title";

  // Use CDPManager to get the target ID
  const cdpTargetId = await cdpManager?.getTargetId(activeView.webContents);
  if (!cdpTargetId) {
    logger.error(`No CDP target ID found for tab: ${checkKey}`);
    return;
  }

  logger.info(`Processing tab: ${tabTitle}`);

  // Extract content FIRST while tab still exists
  const cdpConnector = new CDPConnector("localhost", 9223);
  let extractionSucceeded = false;
  let extractedPageContent: any = null; // Store the full ExtractedPage

  try {
    // Extract page content while tab is still active
    const pageContent = await getCurrentPageContent(
      {
        format: "markdown",
        includeMetadata: true,
        includeActions: false,
        cdpTargetId: cdpTargetId,
        url: tabUrl,
      },
      cdpConnector,
    );

    // Check if extraction was successful
    if ("isError" in pageContent && pageContent.isError) {
      throw new Error(pageContent.message);
    }

    extractedPageContent = pageContent; // Store the full page content
    extractionSucceeded = true;
  } catch (error) {
    logger.error(
      `Content extraction failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    // Always clean up CDP connections
    try {
      await cdpConnector.disconnect(cdpTargetId);
    } catch (cleanupError) {
      logger.error(
        `Error cleaning up CDP connector: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
      );
    }
  }

  // Add immediate favicon to chat context (loading state)
  const { mainStore } = await import("../store/store");
  const currentState = mainStore.getState();

  // Get favicon from sessionTabs store where it was saved during tab lifecycle
  const sessionTab = currentState.sessionTabs.find(
    tab => tab.url === tabUrl || tab.key === checkKey,
  );
  const savedFavicon = sessionTab?.favicon || "";

  // Check if there's already a shared loading entry (regardless of loading state)
  const existingSharedEntry = currentState.requestedTabContext.find(
    tab => tab.key === "shared-loading-tabs",
  );

  // Also check if there are recent completion entries
  const recentCompletions = currentState.requestedTabContext.filter(
    tab => (tab as any).isCompleted !== undefined,
  );

  // If we have a shared entry or recent completions, we should use the shared entry
  const shouldUseSharedEntry =
    existingSharedEntry || recentCompletions.length > 0;

  let updatedTabContext;

  if (shouldUseSharedEntry && existingSharedEntry) {
    // Add this tab to the existing shared entry
    logger.info(`Adding tab to existing shared entry`);

    // Parse existing tabs from the shared entry (stored in a custom property)
    const existingTabs = (existingSharedEntry as any).loadingTabs || [];
    const newTab = {
      key: checkKey,
      url: tabUrl,
      title: tabTitle,
      favicon: savedFavicon,
    };

    const updatedLoadingTabs = [...existingTabs, newTab];

    // Update the shared entry
    updatedTabContext = currentState.requestedTabContext.map(tab => {
      if (tab.key === "shared-loading-tabs") {
        return {
          ...tab,
          title: `Processing ${updatedLoadingTabs.length} tab${updatedLoadingTabs.length > 1 ? "s" : ""}...`,
          favicon: updatedLoadingTabs[0]?.favicon || "", // Use first tab's favicon as main
          isLoading: true, // Mark as loading again
          loadingTabs: updatedLoadingTabs, // Store all loading tabs
        };
      }
      return tab;
    });
  } else if (shouldUseSharedEntry && !existingSharedEntry) {
    // Create new shared loading entry but keep existing completion entries
    logger.info("Creating shared loading entry alongside existing completions");

    const sharedLoadingEntry = {
      key: "shared-loading-tabs",
      url: tabUrl,
      title: `Processing 1 tab...`,
      favicon: savedFavicon,
      isLoading: true,
      canGoBack: false,
      canGoForward: false,
      isAgentActive: false,
      loadingTabs: [
        {
          key: checkKey,
          url: tabUrl,
          title: tabTitle,
          favicon: savedFavicon,
        },
      ],
    };

    // Remove any existing individual entry for this tab and add shared entry
    const filteredContext = currentState.requestedTabContext.filter(
      tab => tab.key !== checkKey,
    );
    updatedTabContext = [...filteredContext, sharedLoadingEntry];
  } else {
    // Create new shared loading entry (first tab scenario)
    logger.info(`Creating new shared loading entry`);

    const sharedLoadingEntry = {
      key: "shared-loading-tabs",
      url: tabUrl,
      title: `Processing 1 tab...`,
      favicon: savedFavicon,
      isLoading: true,
      canGoBack: false,
      canGoForward: false,
      isAgentActive: false,
      loadingTabs: [
        {
          key: checkKey,
          url: tabUrl,
          title: tabTitle,
          favicon: savedFavicon,
        },
      ],
    };

    // Remove any existing individual entry for this tab and add shared entry
    const filteredContext = currentState.requestedTabContext.filter(
      tab => tab.key !== checkKey,
    );
    updatedTabContext = [...filteredContext, sharedLoadingEntry];
  }

  // Add to requestedTabContext immediately
  const immediateState = {
    ...currentState,
    requestedTabContext: updatedTabContext,
  };
  mainStore.setState(immediateState);
  logger.info(`Added loading favicon to chat context`);

  logger.info(`Remove tab from UI`);

  // Now remove tab from UI (non-blocking for user)
  // Use TabManager to close the tab directly instead of IPC to renderer
  const closed = tabManager.closeTab(checkKey);
  if (closed) {
    logger.info(`Tab ${checkKey} closed successfully`);
  } else {
    logger.warn(`Failed to close tab ${checkKey}`);
  }

  logger.info(`Process content in background`);

  // Process content in background (summarization and storage)
  processTabContentInBackground(
    extractedPageContent,
    tabTitle,
    checkKey,
    extractionSucceeded,
  ).catch(error => {
    logger.error(`Background processing failed for ${tabTitle}:`, error);
  });
}

// Helper function to update tab context when processing completes
async function updateTabContextToCompleted(
  tabKey: string,
  title: string,
  isFallback: boolean = false,
): Promise<void> {
  try {
    const { mainStore } = await import("../store/store");
    const currentState = mainStore.getState();

    // Find the shared loading entry
    const sharedLoadingEntry = currentState.requestedTabContext.find(
      tab => tab.key === "shared-loading-tabs" && tab.isLoading,
    );

    let updatedTabContext;

    if (sharedLoadingEntry && (sharedLoadingEntry as any).loadingTabs) {
      // Remove the completed tab from the shared loading entry
      const loadingTabs = (sharedLoadingEntry as any).loadingTabs;
      const completedTab = loadingTabs.find((tab: any) => tab.key === tabKey);
      const remainingLoadingTabs = loadingTabs.filter(
        (tab: any) => tab.key !== tabKey,
      );

      if (completedTab) {
        // Create individual completion entry for this tab
        const completionEntry = {
          key: tabKey,
          url: completedTab.url,
          title: isFallback ? `${title} (partial)` : title,
          favicon: completedTab.favicon,
          isLoading: false,
          isCompleted: !isFallback,
          isFallback: isFallback,
          canGoBack: false,
          canGoForward: false,
          isAgentActive: false,
        };

        if (remainingLoadingTabs.length > 0) {
          // Update shared loading entry with remaining tabs
          updatedTabContext = currentState.requestedTabContext.map(tab => {
            if (tab.key === "shared-loading-tabs") {
              return {
                ...tab,
                title: `Processing ${remainingLoadingTabs.length} tab${remainingLoadingTabs.length > 1 ? "s" : ""}...`,
                favicon: remainingLoadingTabs[0]?.favicon || "",
                loadingTabs: remainingLoadingTabs,
              };
            }
            return tab;
          });
          // Add the completion entry
          updatedTabContext.push(completionEntry);
        } else {
          // No more loading tabs - but keep shared entry as a placeholder for new tabs
          // Just update it to show no loading tabs
          updatedTabContext = currentState.requestedTabContext.map(tab => {
            if (tab.key === "shared-loading-tabs") {
              return {
                ...tab,
                title: `Ready for more tabs...`,
                isLoading: false, // Mark as not loading
                loadingTabs: [], // Empty array
              };
            }
            return tab;
          });
          // Add the completion entry
          updatedTabContext.push(completionEntry);
        }
      } else {
        // Tab not found in shared loading entry - fallback to individual update
        updatedTabContext = currentState.requestedTabContext.map(tab => {
          if (tab.key === tabKey) {
            return {
              ...tab,
              title: isFallback ? `${title} (partial)` : title,
              favicon: tab.favicon,
              isLoading: false,
              isCompleted: !isFallback,
              isFallback: isFallback,
            };
          }
          return tab;
        });
      }
    } else {
      // No shared loading entry - fallback to individual update
      updatedTabContext = currentState.requestedTabContext.map(tab => {
        if (tab.key === tabKey) {
          return {
            ...tab,
            title: isFallback ? `${title} (partial)` : title,
            favicon: tab.favicon,
            isLoading: false,
            isCompleted: !isFallback,
            isFallback: isFallback,
          };
        }
        return tab;
      });
    }

    const updatedState = {
      ...currentState,
      requestedTabContext: updatedTabContext,
    };

    mainStore.setState(updatedState);
    logger.info(`Updated favicon to completed state for: ${title}`);
  } catch (error) {
    logger.error(`Error updating completed favicon:`, error);
  }
}

// Background processing function (non-blocking)
async function processTabContentInBackground(
  pageContent: any, // ExtractedPage or error
  tabTitle: string,
  checkKey: string,
  extractionSucceeded: boolean,
): Promise<void> {
  logger.info(`Starting background content extraction for: ${tabTitle}`);

  // Get the current agent service using the new architecture
  const currentAgentService = getAgentService();

  // Process content if service is available
  if (currentAgentService) {
    // Check if agent service is ready
    const serviceStatus = currentAgentService.getStatus();
    if (!serviceStatus.ready) {
      logger.warn(
        "Agent service not ready for tab memory storage:",
        serviceStatus.serviceStatus,
      );
      updateTabContextToCompleted(checkKey, tabTitle, true);
      return;
    }

    // Use LLM to create actionable summary instead of basic framing
    try {
      // Only proceed with summarization if extraction succeeded
      if (extractionSucceeded && pageContent && !("isError" in pageContent)) {
        // 🔄 Replace Zustand storage with direct MCP call
        try {
          // 🎯 Direct MCP tool call - saves both memory note + content chunks
          await currentAgentService.saveTabMemory(pageContent);
          logger.info(`Saved to memory via MCP: ${tabTitle}`);
        } catch (mcpError) {
          logger.error(`MCP save failed, falling back to Zustand:`, mcpError);

          // 🔧 Fallback: Log error since websiteContexts has been replaced by MCP
          logger.error(
            `Failed to save to MCP and no fallback storage available for: ${tabTitle}`,
          );
          // Note: websiteContexts has been removed from AppState as it's now handled by MCP
        }
        logger.info(`Background processing completed for: ${tabTitle}`);

        // Update the loading favicon to show completion
        updateTabContextToCompleted(checkKey, tabTitle, false);
      } else {
        // Content extraction failed - log warning since websiteContexts no longer available
        logger.info(`Content extraction failed for: ${tabTitle}`);
        logger.warn(
          `No fallback storage available since websiteContexts has been replaced by MCP`,
        );

        // Update with failure state
        updateTabContextToCompleted(checkKey, tabTitle, true);
      }
    } catch (summaryError) {
      logger.error(`Error generating summary:`, summaryError);

      // Fallback: Log error since websiteContexts no longer available
      logger.error(
        `Summary generation failed and no fallback storage available for: ${tabTitle}`,
      );
      logger.warn(`websiteContexts has been replaced by MCP system`);
      logger.info(` Stored fallback content for: ${tabTitle}`);

      // Update with fallback completion
      updateTabContextToCompleted(checkKey, tabTitle, true);
    }
  } else {
    logger.warn("Agent service not available for website context storage");
    updateTabContextToCompleted(checkKey, tabTitle, true);
  }
}

/**
 * Automatically saves a specific tab to memory without closing it
 * Used for background auto-saving when pages finish loading
 */
export async function autoSaveTabToMemory(
  tabKey: string,
  browser: Browser,
): Promise<void> {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (!focusedWindow) {
    logger.error("No focused window available");
    return;
  }

  const appWindow = browser.getApplicationWindow(focusedWindow.webContents.id);
  if (!appWindow) {
    logger.error("No application window found");
    return;
  }

  const browserViewManager = appWindow.viewManager;
  const cdpManager = browser.getCDPManager();

  if (!browserViewManager || !cdpManager) {
    logger.error("Required managers not available");
    return;
  }

  // Get the specific tab's information
  const view = browserViewManager?.getView(tabKey);
  if (!view?.webContents || view.webContents.isDestroyed()) {
    logger.error("No view webContents found for tab:", tabKey);
    return;
  }

  const tabUrl = view.webContents.getURL();
  const tabTitle = view.webContents.getTitle();

  // Get CDP target ID
  const cdpTargetId = await cdpManager?.getTargetId(view.webContents);
  if (!cdpTargetId) {
    logger.error("No CDP target ID found for tab:", tabKey);
    return;
  }

  logger.info(`Starting async save for: ${tabTitle}`);

  // Create CDP connector with unique instance for this save operation
  const cdpConnector = new CDPConnector("localhost", 9223);

  try {
    // Extract content asynchronously - don't wait for loading to finish
    const pageContent = await getCurrentPageContent(
      {
        format: "markdown",
        includeMetadata: true,
        includeActions: false,
        cdpTargetId: cdpTargetId,
        url: tabUrl,
      },
      cdpConnector,
    );

    // Check if extraction was successful
    if ("isError" in pageContent && pageContent.isError) {
      throw new Error(pageContent.message);
    }

    const extractedText =
      extractTextFromPageContent(pageContent) || "No content extracted";

    if (
      extractedText !== "No content extracted" &&
      extractedText.trim().length > 0
    ) {
      // Save to memory asynchronously using the new agent service
      const currentAgentService = getAgentService();

      if (currentAgentService) {
        // Check if agent service is ready
        const serviceStatus = currentAgentService.getStatus();
        if (!serviceStatus.ready) {
          logger.warn(
            "Agent service not ready for auto-save:",
            serviceStatus.serviceStatus,
          );
          return;
        }

        // Fire and forget - don't block other saves
        // Only save if we have a valid ExtractedPage (not an error)
        if (pageContent && !("isError" in pageContent)) {
          currentAgentService
            .saveTabMemory(pageContent)
            .then(() => {
              logger.info(`Async save completed: ${tabTitle}`);
            })
            .catch(error => {
              logger.error(`Async save failed for ${tabTitle}:`, error);
            });
        } else {
          logger.warn(`Cannot save invalid page content for: ${tabTitle}`);
        }
      } else {
        logger.warn("Agent service not available for auto-save");
      }
    } else {
      logger.info(`No meaningful content to save: ${tabTitle}`);
    }
  } catch (error) {
    logger.error("Content extraction failed:", error);
  } finally {
    // Always clean up CDP connection
    try {
      await cdpConnector.disconnect(cdpTargetId);
    } catch (cleanupError) {
      logger.error("Error cleaning up CDP connector:", cleanupError);
    }
  }
}
