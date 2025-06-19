import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type {
  JSONRPCError,
  JSONRPCNotification,
  LoggingMessageNotification,
  Notification,
} from '@modelcontextprotocol/sdk/types.js';
import express, { type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { logger } from './helpers/logs.js';
import { GmailTools } from './tools.js';

const log = logger('server');
const JSON_RPC = '2.0';
const JSON_RPC_ERROR = -32603;

export class StreamableHTTPServer {
  server: Server;
  private httpServer: any;

  constructor(server: Server) {
    this.server = server;
    this.setupServerRequestHandlers();
  }

  async close() {
    log.info('Shutting down server...');
    if (this.httpServer) {
      this.httpServer.close();
    }
    await this.server.close();
    log.info('Server shutdown complete.');
  }

  startHTTPServer(port: number = 3000) {
    const app = express();
    app.use(express.json());

    app.get('*', (req, res) => this.handleGetRequest(req, res));
    app.post('*', (req, res) => this.handlePostRequest(req, res));

    this.httpServer = app.listen(port, () => {
      log.success(`Gmail MCP server listening on port ${port}`);
      log.info(`Server URL: http://localhost:${port}`);
    });

    return this.httpServer;
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

      await this.server.connect(transport as any);
      log.success('Transport connected. Handling request...');

      await transport.handleRequest(req, res, req.body);
      res.on('close', () => {
        log.success('Request closed by client');
        transport.close();
        this.server.close();
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
        tools: GmailTools,
      };
    });

    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request, _extra) => {
        const args = request.params.arguments;
        const toolName = request.params.name;
        const tool = GmailTools.find((tool) => tool.name === toolName);

        log.info(`Handling CallToolRequest for tool: ${toolName}`);

        if (!tool) {
          log.error(`Tool ${toolName} not found.`);
          throw new Error(`Tool ${toolName} not found.`);
        }

        try {
          const result = await tool.execute(args as any);
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

async function startServer() {
  log.info('Starting Gmail MCP server...');

  const server = new Server({
    name: 'gmail-mcp',
    version: '1.0.0',
  }, {
    capabilities: {
      tools: {},
    },
  });

  const streamableServer = new StreamableHTTPServer(server);

  const port = parseInt(process.env.PORT || '3000', 10);
  streamableServer.startHTTPServer(port);

  log.info('Gmail MCP server ready – tools available for use');
  log.info('Available tools:');
  log.info('- send_email: Send emails via Gmail');
  log.info('- draft_email: Create email drafts');
  log.info('- search_emails: Search emails with Gmail query syntax');
  log.info('- read_email: Read email content');
  log.info('- delete_email: Delete emails');

  process.on('SIGINT', async () => {
    log.info('\nShutting down Gmail MCP server...');
    await streamableServer.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    log.info('\nShutting down Gmail MCP server...');
    await streamableServer.close();
    process.exit(0);
  });
}

startServer().catch(error => {
  log.error('Failed to start server:', error);
  process.exit(1);
}); 