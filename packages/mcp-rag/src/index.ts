import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import express, { type Request, type Response } from 'express';
import { StreamableHTTPServer } from './server.js';
import { createLogger } from '@vibe/shared-types';
import { hostname } from 'node:os';
import { createServer } from 'node:http';
import { Socket } from 'node:net';
import { RAGTools } from './tools.js';
import { validatePrivyToken } from './middleware/auth.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const logger = createLogger('mcp-rag');

const server = new StreamableHTTPServer(
  new Server(
    {
      name: 'rag-http-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: Object.fromEntries(RAGTools.map(tool => [tool.name, tool])),
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
const PORT = process.env.PORT || 3000;

// Check if we're in local mode (no auth) or cloud mode (auth required)
const isLocalMode = process.env.USE_LOCAL_RAG_SERVER === 'true';

if (!isLocalMode) {
  // Cloud mode - require authentication
  logger.info('Running in cloud mode with Privy authentication enabled');
  router.post(MCP_ENDPOINT, validatePrivyToken, async (req: Request, res: Response) => {
    await server.handlePostRequest(req, res);
  });

  router.get(MCP_ENDPOINT, validatePrivyToken, async (req: Request, res: Response) => {
    await server.handleGetRequest(req, res);
  });
} else {
  // Local mode - no authentication
  logger.info('Running in local mode without authentication');
  router.post(MCP_ENDPOINT, async (req: Request, res: Response) => {
    await server.handlePostRequest(req, res);
  });

  router.get(MCP_ENDPOINT, async (req: Request, res: Response) => {
    await server.handleGetRequest(req, res);
  });
}

// Health check endpoint (no auth required)
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'rag-mcp',
    timestamp: new Date().toISOString(),
    port: PORT,
    auth: isLocalMode ? 'disabled' : 'enabled'
  });
});

app.use('/', router);

// Create HTTP server and track active connections for graceful shutdown
const httpServer = createServer(app);
const activeSockets = new Set<Socket>();

httpServer.on('connection', (socket: Socket) => {
  activeSockets.add(socket);
  socket.once('close', () => {
    activeSockets.delete(socket);
  });
});

httpServer.listen(PORT, () => {
  logger.info(`MCP endpoint: http://${hostname()}:${PORT}${MCP_ENDPOINT}`);
  logger.info(`Press Ctrl+C to stop the server`);
});

// Graceful shutdown handler
let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info(`Received ${signal}, shutting down gracefully...`);

  try {
    // Stop accepting new connections
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    logger.info('HTTP server closed to new connections');

    // Give active connections time to complete (max 30 seconds)
    const shutdownTimeout = setTimeout(() => {
      logger.warn('Forcefully closing remaining connections after timeout');
      activeSockets.forEach(socket => socket.destroy());
    }, 30000);

    // Wait for all connections to close
    let waitCount = 0;
    const maxWaitCycles = 30; // Max 30 seconds with 1-second intervals
    while (activeSockets.size > 0) {
      if (waitCount >= maxWaitCycles) {
        logger.warn('Max wait time exceeded, forcing shutdown');
        break;
      }
      logger.info(`Waiting for ${activeSockets.size} active connection(s) to close...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      waitCount++;
    }

    clearTimeout(shutdownTimeout);

    // Close MCP server
    await server.close();
    logger.info('Server closed gracefully');

    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); 