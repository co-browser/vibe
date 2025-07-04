import { Server } from "@modelcontextprotocol/sdk/server/index";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types";
import type {
  JSONRPCError,
  JSONRPCNotification,
  LoggingMessageNotification,
  Notification,
} from "@modelcontextprotocol/sdk/types";
import { type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { GmailTools } from "./tools";

// Tool type definition (should match the one in tools.ts)
interface GmailTool {
  name: string;
  description: string;
  inputSchema: any;
  zodSchema: { safeParse: (args: any) => { success: boolean; data?: any; error?: { message: string } } };
  execute: (args: any) => Promise<string>;
}

// Simple console logger - MCP Gmail runs as child process
const log = {
  info: (msg: string, ...args: any[]) => console.log(`[INFO] [mcp-gmail] ${msg}`, ...args),
  success: (msg: string, ...args: any[]) => console.log(`[SUCCESS] [mcp-gmail] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) => console.warn(`[WARN] [mcp-gmail] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => console.error(`[ERROR] [mcp-gmail] ${msg}`, ...args),
};
const JSON_RPC = '2.0';
const JSON_RPC_ERROR = -32603;

export class StreamableHTTPServer {
  server: Server;

  constructor(server: Server) {
    this.server = server;
    this.setupServerRequestHandlers();
  }

  async close() {
    log.info('Shutting down server...');
    await this.server.close();
    log.info('Server shutdown complete.');
  }

  async handleGetRequest(req: Request, res: Response) {
    res.status(405).json(this.createRPCErrorResponse('Method not allowed.'));
    log.info('Responded to GET with 405 Method Not Allowed');
  }

  async handlePostRequest(req: Request, res: Response) {
    log.info(`POST ${req.originalUrl} (${req.ip}) - payload:`, req.body);
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      log.info('Connecting transport to server...');

      await this.server.connect(transport);
      log.success('Transport connected. Handling request...');

      await transport.handleRequest(req, res, req.body);
      res.on('close', () => {
        log.success('Request closed by client');
        transport.close();
        // Don't close the server for individual requests
      });

      await this.sendMessages(transport);
      log.success(
        `POST request handled successfully (status=${res.statusCode})`
      );
    } catch (error) {
      log.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res
          .status(500)
          .json(this.createRPCErrorResponse('Internal server error.'));
        log.error('Responded with 500 Internal Server Error');
      }
    }
  }

  private setupServerRequestHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async (_request) => {
      return {
        jsonrpc: JSON_RPC,
        tools: GmailTools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      };
    });

    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request, _extra) => {
        const args = request.params.arguments;
        const toolName = request.params.name;
        const tool: GmailTool | undefined = GmailTools.find((tool) => tool.name === toolName);

        log.info(`Handling CallToolRequest for tool: ${toolName}`);

        if (!tool) {
          log.error(`Tool ${toolName} not found.`);
          throw new Error(`Tool ${toolName} not found.`);
        }

        if (!args) {
          log.error(`No arguments provided for tool ${toolName}`);
          throw new Error(`No arguments provided for tool ${toolName}`);
        }

        try {
          // Validate args against tool's Zod schema before execution
          const parseResult = tool.zodSchema.safeParse(args);
          if (!parseResult.success) {
            throw new Error(`Invalid arguments for tool ${toolName}: ${parseResult.error.message}`);
          }
          const result = await tool.execute(parseResult.data);
          log.success(`Tool ${toolName} executed. Result:`, result);
          return {
            content: [
              {
                type: 'text',
                text: result,
              },
            ],
          };
        } catch (error: any) {
          log.error(`Error executing tool ${toolName}:`, error);

          // Extract error message
          let errorMessage = `Error executing tool ${toolName}: `;
          if (error.response?.data?.error?.message) {
            errorMessage += error.response.data.error.message;
          } else if (error.message) {
            errorMessage += error.message;
          } else {
            errorMessage += 'Unknown error';
          }

          throw new Error(errorMessage);
        }
      }
    );
  }

  private async sendMessages(transport: StreamableHTTPServerTransport) {
    const message: LoggingMessageNotification = {
      method: 'notifications/message',
      params: { level: 'info', data: 'SSE Connection established' },
    };
    log.info('Sending SSE connection established notification.');
    this.sendNotification(transport, message);
  }

  private async sendNotification(
    transport: StreamableHTTPServerTransport,
    notification: Notification
  ) {
    const rpcNotification: JSONRPCNotification = {
      ...notification,
      jsonrpc: JSON_RPC,
    };
    log.info(`Sending notification: ${notification.method}`);
    await transport.send(rpcNotification);
  }

  private createRPCErrorResponse(message: string): JSONRPCError {
    return {
      jsonrpc: JSON_RPC,
      error: {
        code: JSON_RPC_ERROR,
        message: message,
      },
      id: randomUUID(),
    };
  }
} 