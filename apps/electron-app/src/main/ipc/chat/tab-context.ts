import { ipcMain } from "electron";
import { browser } from "@/index";
import { createLogger } from "@vibe/shared-types";
import { TabContextOrchestrator } from "@/services/tab-context-orchestrator";

const logger = createLogger("TabContextIPC");

// Store orchestrator instances per window
const orchestrators = new Map<number, TabContextOrchestrator>();

/**
 * Tab context IPC handlers for the @tabName feature
 */

// Process prompt with tab context
ipcMain.handle(
  "tab:process-prompt",
  async (
    event,
    userPrompt: string,
    systemPrompt: string,
    conversationHistory?: any[],
  ) => {
    try {
      const appWindow = browser?.getApplicationWindow(event.sender.id);
      if (!appWindow) {
        return {
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          parsedPrompt: {
            originalPrompt: userPrompt,
            cleanPrompt: userPrompt,
            extractedAliases: [],
            aliasPositions: [],
          },
          includedTabs: [],
          errors: ["Window not found"],
        };
      }

      // Get or create orchestrator for this window
      let orchestrator = orchestrators.get(event.sender.id);
      if (!orchestrator) {
        orchestrator = new TabContextOrchestrator(
          appWindow.tabManager,
          appWindow.viewManager,
          browser?.getCDPManager(),
        );
        await orchestrator.initialize();
        orchestrators.set(event.sender.id, orchestrator);
      }

      // Process the prompt
      const result = await orchestrator.processPromptWithTabContext(
        userPrompt,
        systemPrompt,
        conversationHistory,
      );

      return result;
    } catch (error) {
      logger.error("Failed to process prompt with tab context:", error);
      return {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        parsedPrompt: {
          originalPrompt: userPrompt,
          cleanPrompt: userPrompt,
          extractedAliases: [],
          aliasPositions: [],
        },
        includedTabs: [],
        errors: ["Failed to process tab context"],
      };
    }
  },
);

// Get current alias mapping
ipcMain.handle("tab:get-aliases", async event => {
  try {
    const appWindow = browser?.getApplicationWindow(event.sender.id);
    if (!appWindow) {
      logger.warn("No application window found for alias request");
      return {};
    }

    // Get or create orchestrator for this window
    let orchestrator = orchestrators.get(event.sender.id);
    if (!orchestrator) {
      orchestrator = new TabContextOrchestrator(
        appWindow.tabManager,
        appWindow.viewManager,
        browser?.getCDPManager(),
      );
      await orchestrator.initialize();
      orchestrators.set(event.sender.id, orchestrator);
      logger.info("Created new orchestrator for alias request");
    }

    const mapping = orchestrator.getAliasMapping();
    logger.info("Returning alias mapping:", {
      count: Object.keys(mapping).length,
      mapping,
    });
    return mapping;
  } catch (error) {
    logger.error("Failed to get aliases:", error);
    return {};
  }
});

// Set custom alias for a tab
ipcMain.handle(
  "tab:set-custom-alias",
  async (event, tabKey: string, customAlias: string) => {
    try {
      const orchestrator = orchestrators.get(event.sender.id);
      if (!orchestrator) {
        return { success: false, error: "Orchestrator not found" };
      }

      const success = orchestrator.setCustomAlias(tabKey, customAlias);

      if (success) {
        // Notify renderer of the update
        event.sender.send("tab:alias-updated", { tabKey, alias: customAlias });
      }

      return { success, error: success ? null : "Failed to set alias" };
    } catch (error) {
      logger.error("Failed to set custom alias:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
);

// Get alias suggestions
ipcMain.handle("tab:get-alias-suggestions", async (event, partial: string) => {
  try {
    const orchestrator = orchestrators.get(event.sender.id);
    if (!orchestrator) {
      return [];
    }

    return orchestrator.getAliasSuggestions(partial);
  } catch (error) {
    logger.error("Failed to get alias suggestions:", error);
    return [];
  }
});

// Clean up orchestrator when window closes
ipcMain.on("browser-window-closed", (_event, windowId: number) => {
  const orchestrator = orchestrators.get(windowId);
  if (orchestrator) {
    orchestrator.destroy().catch(error => {
      logger.error("Failed to destroy orchestrator:", error);
    });
    orchestrators.delete(windowId);
  }
});

// Export for use in other modules
export function getTabContextOrchestrator(
  windowId: number,
): TabContextOrchestrator | undefined {
  return orchestrators.get(windowId);
}
