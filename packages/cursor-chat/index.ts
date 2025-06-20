import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import sqlite3 from 'sqlite3';
import { open as sqliteOpen } from 'sqlite';

const DEBUG = false;

interface WorkspaceInfo {
  id: string;
  path: string;
  folder?: string;
  lastModified: string;
  chatCount: number;
}

interface Bubble {
  type: string;
  text?: string;
  codeBlocks?: Array<{
    language?: string;
    code: string;
  }>;
}

interface ChatTab {
  tabId: string;
  chatTitle?: string;
  lastSendTime?: string;
  bubbles?: Bubble[];
}



interface ComposerMessage {
  type: number;
  text?: string;
  suggestedCodeBlocks?: Array<{
    language?: string;
    code: string;
  }>;
}

interface Composer {
  composerId: string;
  name?: string;
  lastUpdatedAt?: string;
  conversation?: ComposerMessage[];
}



interface WorkspaceDetail {
  tabs: Array<{
    id: string;
    title: string;
    timestamp: string;
    bubbles?: Bubble[];
  }>;
  composers?: {
    allComposers: Composer[];
  };
}

interface AllChatData {
  workspaceInfo: WorkspaceInfo;
  chatData: WorkspaceDetail;
}

async function exportAllChatHistory(): Promise<AllChatData[]> {
  try {
    const workspaces = await getAllWorkspaces();

    const filterdWorkspaces = DEBUG ? workspaces
      .filter((w) => {
        if (w && w.folder) {
          return w.folder.endsWith('cursor-export')
        }
        return false;
      })
      : workspaces;

    const allChats: AllChatData[] = [];

    for (const workspace of filterdWorkspaces) {
      try {
        const detail = await getWorkspaceDetail(workspace.id, workspace.folder);

        if (DEBUG) {
          if (detail) {
            await fs.writeFile('debug/detail.json', JSON.stringify(detail, null, 2));
          }
        }

        allChats.push({
          workspaceInfo: workspace,
          chatData: detail
        });
      } catch (error) {
        console.error(`Error getting details for workspace ${workspace.id}:`, error);
      }
    }

    if (DEBUG) {
      await fs.writeFile('debug/allChats.json', JSON.stringify(allChats, null, 2));
    }

    return allChats;
  } catch (error) {
    console.error('Failed to export chat history:', error);
    throw error;
  }
}

const safeParseTimestamp = (timestamp?: string): string => {
  try {
    if (!timestamp) {
      return new Date().toISOString();
    }
    return new Date(timestamp).toISOString();
  } catch (error) {
    console.error('Error parsing timestamp:', error, 'Raw value:', timestamp);
    return new Date().toISOString();
  }
};

async function getAllWorkspaces(): Promise<WorkspaceInfo[]> {
  try {
    const workspacePath = process.env.WORKSPACE_PATH || '/Users/rpm/Library/Application Support/Cursor/User/workspaceStorage';
    const workspaces: WorkspaceInfo[] = [];

    const entries = await fs.readdir(workspacePath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dbPath = path.join(workspacePath, entry.name, 'state.vscdb');
        const workspaceJsonPath = path.join(workspacePath, entry.name, 'workspace.json');

        if (!existsSync(dbPath)) {
          console.log(`Skipping ${entry.name}: no state.vscdb found`);
          continue;
        }

        try {
          const stats = await fs.stat(dbPath);
          const db = await sqliteOpen({
            filename: dbPath,
            driver: sqlite3.Database
          });

          const result = await db.get(`
            SELECT value FROM ItemTable 
            WHERE [key] = 'workbench.panel.aichat.view.aichat.chatdata'
          `);

          let chatCount = 0;
          if (result?.value) {
            try {
              const chatData = JSON.parse(result.value);
              chatCount = chatData.tabs?.length || 0;
            } catch (error) {
              console.error('Error parsing chat data:', error);
            }
          }

          let folder: string | undefined = undefined;
          try {
            const workspaceData = JSON.parse(await fs.readFile(workspaceJsonPath, 'utf-8'));
            folder = workspaceData.folder;
          } catch {
            console.log(`No workspace.json found for ${entry.name}`);
          }

          workspaces.push({
            id: entry.name,
            path: dbPath,
            folder: folder,
            lastModified: stats.mtime.toISOString(),
            chatCount: chatCount
          });

          await db.close();
        } catch (error) {
          console.error(`Error processing workspace ${entry.name}:`, error);
        }
      }
    }

    return workspaces;
  } catch (error) {
    console.error('Failed to get workspaces:', error);
    throw error;
  }
}

async function getWorkspaceDetail(workspaceId: string, _workspaceFolder?: string): Promise<WorkspaceDetail> {
  try {
    const workspacePath = process.env.WORKSPACE_PATH || '/Users/rpm/Library/Application Support/Cursor/User/workspaceStorage';
    const dbPath = path.join(workspacePath, workspaceId, 'state.vscdb');

    if (DEBUG) {
      console.log('workspaceId', workspaceId);
      console.log('dbPath', dbPath);
    }

    const db = await sqliteOpen({
      filename: dbPath,
      driver: sqlite3.Database
    });

    const chatResult = await db.get(`
      SELECT value FROM ItemTable
      WHERE [key] = 'workbench.panel.aichat.view.aichat.chatdata'
    `);

    if (DEBUG) {
      console.log('chatResult', chatResult);
    }

    const composerResult = await db.get(`
      SELECT value FROM ItemTable
      WHERE [key] = 'composer.composerData'
    `);

    await db.close();

    if (!chatResult && !composerResult) {
      return {
        tabs: [],
        composers: {
          allComposers: []
        }
      }
    }

    const response: WorkspaceDetail = { tabs: [] };

    if (chatResult) {
      const chatData = JSON.parse(chatResult.value);
      response.tabs = chatData.tabs.map((tab: ChatTab) => ({
        id: tab.tabId,
        title: tab.chatTitle?.split('\n')[0] || `Chat ${tab.tabId.slice(0, 8)}`,
        timestamp: safeParseTimestamp(tab.lastSendTime),
        bubbles: tab.bubbles
      }));
    }

    if (DEBUG) {
      if (chatResult) {
        await fs.writeFile('debug/chatResult.json', chatResult.value);
      }

      if (composerResult) {
        await fs.writeFile('debug/composerResult.json', composerResult.value);
      }
    }

    if (composerResult) {
      const globalDbPath = path.join(workspacePath, '..', 'globalStorage', 'state.vscdb');
      const composers = JSON.parse(composerResult.value);
      const keys = composers.allComposers.map((it: any) => `composerData:${it.composerId}`);
      const placeholders = keys.map(() => '?').join(',');

      const globalDb = await sqliteOpen({
        filename: globalDbPath,
        driver: sqlite3.Database
      });

      const composersBodyResult = await globalDb.all(`
        SELECT [key], value FROM cursorDiskKV
        WHERE [key] in (${placeholders})
      `, keys);

      await globalDb.close();

      if (composersBodyResult && composersBodyResult.length > 0) {
        const composerDetails = composersBodyResult.map((result: any) => {
          const composerId = result.key.replace('composerData:', '');
          const composerData = JSON.parse(result.value);
          return {
            ...composerData,
            composerId
          };
        });

        if (DEBUG) {
          await fs.writeFile('debug/allComposers.json', JSON.stringify(composerDetails, null, 2));
        }

        response.composers = {
          allComposers: composerDetails
        };
      }
    }

    if (DEBUG) {
      await fs.writeFile('debug/response.json', JSON.stringify(response, null, 2));
    }

    return response;
  } catch (error) {
    console.error('Failed to get workspace data:', error);
    throw error;
  }
}

module.exports = {
  getAllWorkspaces,
  getWorkspaceDetail,
  exportAllChatHistory
};