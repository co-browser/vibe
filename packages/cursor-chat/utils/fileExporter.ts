import fs from 'fs/promises';
import path from 'path';
import { convertToMarkdown, convertToHtml } from './converters.ts';
import { getSafeFilename } from './formatters.ts';

interface WorkspaceInfo {
  id: string;
  folder?: string;
  lastModified: string;
  chatCount: number;
}

interface CodeBlock {
  language?: string;
  code: string;
}

interface Bubble {
  type: string;
  text?: string;
  codeBlocks?: CodeBlock[];
}

interface ChatTab {
  id: string;
  title: string;
  timestamp: string;
  bubbles?: Bubble[];
}

interface ComposerMessage {
  type: number;
  text?: string;
  suggestedCodeBlocks?: CodeBlock[];
}

interface Composer {
  composerId: string;
  name?: string;
  lastUpdatedAt?: string;
  conversation?: ComposerMessage[];
}

interface WorkspaceDetail {
  tabs: ChatTab[];
  composers?: {
    allComposers: Composer[];
  };
}

interface Workspace {
  workspaceInfo: WorkspaceInfo;
  chatData: WorkspaceDetail;
}

interface ConversationEntry {
  role: string;
  text: string;
  codeBlocks: CodeBlock[];
}

interface WorkspaceData {
  workspace: string;
  workspaceInfo: WorkspaceInfo;
  chats: Array<{
    title: string;
    timestamp: string;
    conversation: ConversationEntry[];
  }>;
  composers: Array<{
    title: string;
    composerId: string;
    lastUpdatedAt?: string;
    conversation: ConversationEntry[];
  }>;
}

async function createExportDirectories(outputDir: string): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });

  const formats = ['html', 'markdown'];
  for (const format of formats) {
    await fs.mkdir(path.join(outputDir, format), { recursive: true });
  }
  await fs.mkdir(path.join(outputDir, 'json'), { recursive: true });
}

async function exportWorkspace(workspace: Workspace, outputDir: string): Promise<WorkspaceData | null> {
  const hasChatTabs = workspace.chatData.tabs && workspace.chatData.tabs.length > 0;
  const hasComposers = workspace.chatData.composers && workspace.chatData.composers.allComposers && workspace.chatData.composers.allComposers.length > 0;

  const workspaceName = workspace.workspaceInfo.folder
    ? path.basename(workspace.workspaceInfo.folder)
    : workspace.workspaceInfo.id;

  if (!hasChatTabs && !hasComposers) {
    console.log('Skipping empty workspace:', workspaceName);
    return null;
  }

  console.log('Processing workspace:', workspaceName);

  const formats = ['html', 'markdown'];
  for (const format of formats) {
    await fs.mkdir(path.join(outputDir, format, workspaceName), { recursive: true });
  }

  const workspaceData: WorkspaceData = {
    workspace: workspaceName,
    workspaceInfo: workspace.workspaceInfo,
    chats: [],
    composers: []
  };

  if (hasChatTabs) {
    for (const tab of workspace.chatData.tabs) {
      await exportChatTab(tab, workspace, workspaceName, outputDir, workspaceData);
    }
  }

  if (hasComposers) {
    for (const composer of workspace.chatData.composers.allComposers) {
      await exportComposer(composer, workspace, workspaceName, outputDir, workspaceData);
    }
  }

  if (workspaceData.chats.length > 0 || workspaceData.composers.length > 0) {
    const jsonPath = path.join(outputDir, 'json', `${workspaceName}.json`);
    await fs.writeFile(jsonPath, JSON.stringify(workspaceData, null, 2), 'utf-8');
  }

  return workspaceData;
}

async function exportChatTab(tab: ChatTab, workspace: Workspace, workspaceName: string, outputDir: string, workspaceData: WorkspaceData): Promise<void> {
  const filename = getSafeFilename(tab.timestamp, tab.title);

  const markdown = convertToMarkdown(tab, workspace.workspaceInfo);

  const mdPath = path.join(outputDir, 'markdown', workspaceName, `${filename}.md`);
  await fs.writeFile(mdPath, markdown, 'utf-8');

  const html = await convertToHtml(markdown);
  const htmlPath = path.join(outputDir, 'html', workspaceName, `${filename}.html`);
  await fs.writeFile(htmlPath, html, 'utf-8');

  workspaceData.chats.push({
    title: tab.title,
    timestamp: tab.timestamp,
    conversation: tab.bubbles ? tab.bubbles.map(bubble => ({
      role: bubble.type === 'ai' ? 'Cursor' : 'Assistant',
      text: bubble.text || '',
      codeBlocks: bubble.codeBlocks || []
    })) : []
  });
}

async function exportComposer(composer: Composer, workspace: Workspace, workspaceName: string, outputDir: string, workspaceData: WorkspaceData): Promise<void> {
  if (!composer.conversation || composer.conversation.length === 0) {
    return;
  }

  const title = composer.name || `Composer ${composer.composerId}`;
  const filename = composer.name
    ? getSafeFilename(composer.lastUpdatedAt || Date.now().toString(), composer.name)
    : `composer-${composer.composerId}`;

  const composerData = {
    title: title,
    bubbles: composer.conversation.map(msg => ({
      type: msg.type === 1 ? 'user' : 'ai',
      text: msg.text || '',
      codeBlocks: msg.suggestedCodeBlocks || []
    }))
  };

  const markdown = convertToMarkdown(composerData, workspace.workspaceInfo);

  const mdPath = path.join(outputDir, 'markdown', workspaceName, `${filename}.md`);
  await fs.writeFile(mdPath, markdown, 'utf-8');

  const html = await convertToHtml(markdown);
  const htmlPath = path.join(outputDir, 'html', workspaceName, `${filename}.html`);
  await fs.writeFile(htmlPath, html, 'utf-8');

  workspaceData.composers.push({
    title: title,
    composerId: composer.composerId,
    lastUpdatedAt: composer.lastUpdatedAt,
    conversation: composer.conversation.map(msg => ({
      role: msg.type === 1 ? 'User' : 'Cursor',
      text: msg.text || '',
      codeBlocks: msg.suggestedCodeBlocks || []
    }))
  });
}

async function exportAllWorkspaces(chatHistory: Workspace[], outputDir: string): Promise<(WorkspaceData | null)[]> {
  await createExportDirectories(outputDir);

  const results: (WorkspaceData | null)[] = [];
  for (const workspace of chatHistory) {
    const workspaceData = await exportWorkspace(workspace, outputDir);
    results.push(workspaceData);
  }

  return results;
}

export { exportAllWorkspaces };