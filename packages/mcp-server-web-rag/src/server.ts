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
import { RAGTools } from './tools.js';

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
    app.use(express.json({ limit: '10mb' }));

    app.get('*', (req, res) => this.handleGetRequest(req, res));
    app.post('*', (req, res) => this.handlePostRequest(req, res));

    this.httpServer = app.listen(port, () => {
      log.success(`RAG MCP server listening on port ${port}`);
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
        tools: RAGTools,
      };
    });
    
    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request, _extra) => {
        const args = request.params.arguments;
        const toolName = request.params.name;
        const tool = RAGTools.find((tool) => tool.name === toolName);

        log.info(`Handling CallToolRequest for tool: ${toolName}`);
        log.info(`Tool arguments:`, args);

        if (!tool) {
          log.error(`Tool ${toolName} not found.`);
          return this.createRPCErrorResponse(`Tool ${toolName} not found.`);
        }
        
        try {
          log.info(`Executing tool ${toolName}...`);
          const result = await tool.execute(args as any);
          log.success(`Tool ${toolName} executed successfully. Result:`, result);
          
          const response = {
            jsonrpc: JSON_RPC,
            content: [
              {
                type: 'text',
                text: `Tool ${toolName} executed with arguments ${JSON.stringify(
                  args
                )}. Result: ${JSON.stringify(result)}`,
              },
            ],
          };
          
          log.info(`Returning response:`, response);
          return response;
          
        } catch (error) {
          log.error(`Error executing tool ${toolName}:`, error);
          log.error(`Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
          return this.createRPCErrorResponse(
            `Error executing tool ${toolName}: ${error}`
          );
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
  log.info('Starting RAG MCP server...');

  const server = new Server({
    name: 'rag-web-mcp',
    version: '1.0.0',
  }, {
    capabilities: {
      tools: {},
    },
  });

  const streamableServer = new StreamableHTTPServer(server);
  
  const port = parseInt(process.env.PORT || '3000', 10);
  streamableServer.startHTTPServer(port);

  log.info('RAG MCP server ready – tools available for use');
  log.info('Available tools:');
  log.info('- ingest_url: Crawl and ingest a webpage into the knowledge base');
  log.info('- ingest_extracted_page: Ingest an extracted page into the knowledge base');
  log.info('- query_kb: Search the knowledge base with hybrid search');

  process.on('SIGINT', async () => {
    log.info('\nShutting down RAG MCP server...');
    await streamableServer.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    log.info('\nShutting down RAG MCP server...');
    await streamableServer.close();
    process.exit(0);
  });
}

startServer().catch(error => {
  log.error('Failed to start server:', error);
  process.exit(1);
}); 