/**
 * Application menu setup
 * Builds and manages the application menu with browser integration
 */

import { Menu, type MenuItemConstructorOptions } from "electron";
import { Browser } from "@/browser/browser";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("ApplicationMenu");
import { createFileMenu } from "@/menu/items/file";
import { createEditMenu } from "@/menu/items/edit";
import { createViewMenu } from "@/menu/items/view";
import { createNavigationMenu } from "@/menu/items/navigation";
import { createWindowMenu } from "@/menu/items/window";
import { createTabsMenu } from "@/menu/items/tabs";
import { createHelpMenu } from "@/menu/items/help";

/**
 * Sets up the application menu with browser integration
 */
export function setupApplicationMenu(browser: Browser): () => void {
  const buildMenu = () => {
    const isMac = process.platform === "darwin";

    // macOS app menu
    const macAppMenu: MenuItemConstructorOptions = {
      label: "Vibe Browser",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    };

    const template: MenuItemConstructorOptions[] = [
      ...(isMac ? [macAppMenu] : []),
      createFileMenu(browser),
      createEditMenu(),
      createViewMenu(browser),
      createNavigationMenu(browser),
      createWindowMenu(),
      createTabsMenu(browser),
      createHelpMenu(),
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    logger.info("Application menu built and set");
  };

  // Build initial menu
  buildMenu();

  // Return rebuild function for dynamic updates
  return buildMenu;
}
