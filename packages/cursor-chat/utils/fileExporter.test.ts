import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { exportAllWorkspaces } from './fileExporter.ts';
import { promises as fs } from 'fs';

interface WrittenFiles {
  [key: string]: string;
}

let writtenFiles: WrittenFiles = {};

describe('fileExporter', () => {
  beforeEach(() => {
    writtenFiles = {};
    (fs.mkdir as any) = async () => {};
    (fs.writeFile as any) = async (filePath: string, data: string) => {
      writtenFiles[filePath] = data;
    };
  });

  const mockWorkspace = {
    workspaceInfo: { folder: '/test/project', id: 'test123', lastModified: '2023-01-01T00:00:00.000Z', chatCount: 0 },
    chatData: { tabs: [], composers: { allComposers: [] } }
  };

  it('should handle composer with undefined conversation', async () => {
    const composer = {
      composerId: 'test',
      name: 'Test',
      text: 'has text',
      conversation: undefined
    };
    
    const chatHistory = [{
      ...mockWorkspace,
      chatData: { tabs: [], composers: { allComposers: [composer] } }
    }];

    await exportAllWorkspaces(chatHistory, 'test-output');
    assert.strictEqual(Object.keys(writtenFiles).length, 0);
  });

  it('should handle composer with null conversation', async () => {
    const composer = {
      composerId: 'test',
      name: 'Test', 
      text: 'has text',
      conversation: null as any
    };
    
    const chatHistory = [{
      ...mockWorkspace,
      chatData: { tabs: [], composers: { allComposers: [composer] } }
    }];

    await exportAllWorkspaces(chatHistory, 'test-output');
    assert.strictEqual(Object.keys(writtenFiles).length, 0);
  });

  it('should export composer with valid conversation', async () => {
    const composer = {
      composerId: 'test',
      name: 'Test',
      conversation: [{ type: 1, text: 'hello' }]
    };
    
    const chatHistory = [{
      ...mockWorkspace,
      chatData: { tabs: [], composers: { allComposers: [composer] } }
    }];

    await exportAllWorkspaces(chatHistory, 'test-output');
    assert.strictEqual(Object.keys(writtenFiles).length, 3);
  });
});