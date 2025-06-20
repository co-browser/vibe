import { ipcMain } from "electron";
import { browser } from "@/index";
import { CDPConnector, getCurrentPageContent } from "@vibe/tab-extraction-core";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("ContentIPC");

/**
 * Content management IPC handlers
 * Window-specific approach using event.sender.id auto-detection
 */

ipcMain.handle("content:extract", async event => {
  const appWindow = browser?.getApplicationWindow(event.sender.id);
  if (!appWindow) return { content: "", url: "", title: "" };

  const activeTab = appWindow.tabManager.getActiveTab();
  if (!activeTab) return { content: "", url: "", title: "" };

  try {
    // Get the active tab key and browser view
    const activeTabKey = appWindow.tabManager.getActiveTabKey();
    if (activeTabKey === undefined || activeTabKey === null) {
      return { content: "", url: activeTab.url, title: activeTab.title };
    }

    const activeView = appWindow.viewManager?.getView(activeTabKey);
    if (!activeView?.webContents) {
      return { content: "", url: activeTab.url, title: activeTab.title };
    }

    // Get CDP target ID
    const cdpManager = browser?.getCDPManager();
    const cdpTargetId = await cdpManager?.getTargetId(activeView.webContents);
    if (!cdpTargetId) {
      return { content: "", url: activeTab.url, title: activeTab.title };
    }

    // Extract content using tab-extraction-core
    const cdpConnector = new CDPConnector("localhost", 9223);
    const pageContent = await getCurrentPageContent(
      {
        format: "markdown",
        includeMetadata: true,
        includeActions: false,
        cdpTargetId: cdpTargetId,
        url: activeTab.url,
      },
      cdpConnector,
    );

    await cdpConnector.disconnect(cdpTargetId);

    // Check if extraction was successful and extract content
    let extractedContent = "";
    if (!("isError" in pageContent) && pageContent.content) {
      extractedContent = pageContent.content;
    }

    return {
      content: extractedContent,
      url: activeTab.url,
      title: activeTab.title,
    };
  } catch (error) {
    logger.error("Content extraction failed:", error);
    return { content: "", url: activeTab.url, title: activeTab.title };
  }
});

ipcMain.handle("content:get-context", async (_event, url: string) => {
  try {
    // Note: websiteContexts has been replaced by MCP memory system
    // This handler now returns null since contexts are managed via MCP
    return { url, context: null };
  } catch (error) {
    logger.error("Failed to get context:", error);
    return { url, context: null };
  }
});

ipcMain.handle("content:get-saved-contexts", async _event => {
  try {
    // Note: websiteContexts has been replaced by MCP memory system
    // This handler now returns empty array since contexts are managed via MCP
    return [];
  } catch (error) {
    logger.error("Failed to get saved contexts:", error);
    return [];
  }
});

ipcMain.on("add-website-context", (_event, context: any) => {
  try {
    // Note: websiteContexts has been replaced by MCP memory system
    // This handler is now a no-op since contexts are managed via MCP
    logger.info(`Website context saved:`, {
      id: context.id,
      title: context.title,
      domain: context.domain,
    });
  } catch (error) {
    logger.error("Failed to save website context:", error);
  }
});
