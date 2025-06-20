import { marked } from 'marked';
import fs from 'fs/promises';
import { formatDateTime } from './formatters.js';

interface WorkspaceInfo {
  id: string;
  folder?: string;
  lastModified: string;
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

interface ChatData {
  title: string;
  bubbles?: Bubble[];
}

function convertToMarkdown(chatData: ChatData, workspaceInfo: WorkspaceInfo): string {
  let markdown = '';
  
  if (workspaceInfo.folder) {
    const cleanPath = workspaceInfo.folder.replace(/^file:\/\//, '');
    markdown += `# Workspace: ${cleanPath}\n\n`;
  } else {
    markdown += `# Workspace: ${workspaceInfo.id}\n\n`;
  }
  
  markdown += `Last Modified: ${formatDateTime(workspaceInfo.lastModified)}\n\n`;
  
  markdown += `## ${chatData.title}\n\n`;
  
  if (chatData.bubbles) {
    for (const bubble of chatData.bubbles) {
      if (!bubble.text && (!bubble.codeBlocks || bubble.codeBlocks.length === 0)) {
        continue;
      }
      
      const role = bubble.type === 'ai' ? 'Cursor' : 'User';
      markdown += `**${role}**:\n\n${bubble.text}\n\n`;
      
      if (bubble.codeBlocks) {
        for (const block of bubble.codeBlocks) {
          markdown += '```' + (block.language || '') + '\n';
          markdown += block.code + '\n';
          markdown += '```\n\n';
        }
      }
    }
  }
  
  return markdown;
}

async function convertToHtml(markdown: string): Promise<string> {
  const htmlContent = marked(markdown);
  const cssPath = require.resolve('github-markdown-css/github-markdown.css');
  const css = await fs.readFile(cssPath, 'utf-8');
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cursor Chat History</title>
    <style>
        ${css}
        .markdown-body {
            box-sizing: border-box;
            min-width: 200px;
            max-width: 980px;
            margin: 0 auto;
            padding: 45px;
        }

        .markdown-body ul,
        .markdown-body ol {
          margin-top: 0.5em !important;
          margin-bottom: 0.5em !important;
          padding-left: 2em !important;
        }

        .markdown-body ul{
          list-style-type: disc !important;
        }

        .markdown-body ol {
          list-style-type: decimal !important;
        }

        @media (max-width: 767px) {
            .markdown-body {
                padding: 15px;
            }
        }
    </style>
</head>
<body class="markdown-body">
    ${htmlContent}
</body>
</html>`;
}

module.exports = {
  convertToMarkdown,
  convertToHtml
};