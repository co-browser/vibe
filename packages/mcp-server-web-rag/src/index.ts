import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import express, { type Request, type Response } from 'express';
import { StreamableHTTPServer } from './server.js';
import { logger } from './helpers/logs.js';
import { hostname } from 'node:os';

const log = logger('index');

const server = new StreamableHTTPServer(
  new Server(
    {
      name: 'rag-web-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  )
);

const app = express();
// Set JSON body limit to 1MB - sufficient for ExtractedPage objects with full web content
// while preventing DoS attacks. Most web pages are under 1MB of text content when JSON-serialized.
app.use(express.json({ limit: '1mb' }));

const router = express.Router();
const MCP_ENDPOINT = '/mcp';

router.post(MCP_ENDPOINT, async (req: Request, res: Response) => {
  try {
    await server.handlePostRequest(req, res);
  } catch (error) {
    log.error('Error handling POST request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error while processing MCP request'
        },
        id: null
      });
    }
  }
});

router.get(MCP_ENDPOINT, async (req: Request, res: Response) => {
  try {
    await server.handleGetRequest(req, res);
  } catch (error) {
    log.error('Error handling GET request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error while processing MCP request'
        },
        id: null
      });
    }
  }
});

app.use('/', router);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  log.success(`RAG MCP Streamable HTTP Server`);
  log.success(`MCP endpoint: http://${hostname()}:${PORT}${MCP_ENDPOINT}`);
  log.success(`Press Ctrl+C to stop the server`);
});

process.on('SIGINT', async () => {
  log.info('Shutting down server...');
  try {
    await server.close();
    log.success('Server shutdown completed successfully');
  } catch (error) {
    log.error('Error during server shutdown:', error);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  log.info('Shutting down server...');
  try {
    await server.close();
    log.success('Server shutdown completed successfully');
  } catch (error) {
    log.error('Error during server shutdown:', error);
  }
  process.exit(0);
}); 