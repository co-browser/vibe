import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import express, { type Request, type Response } from 'express';
import { StreamableHTTPServer } from './server.js';
// Simple console logger for MCP Gmail
import { hostname } from 'node:os';
import { createServer } from 'node:http';
import { Socket } from 'node:net';
import { GmailTools } from './tools.js';

const log = {
  info: (msg: string, ...args: any[]) => console.log(`[INFO] [mcp-gmail] ${msg}`, ...args),
  success: (msg: string, ...args: any[]) => console.log(`[SUCCESS] [mcp-gmail] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) => console.warn(`[WARN] [mcp-gmail] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => console.error(`[ERROR] [mcp-gmail] ${msg}`, ...args),
};

const server = new StreamableHTTPServer(
  new Server(
    {
      name: 'gmail-http-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: Object.fromEntries(
          GmailTools.map(tool => [
            tool.name,
            {
              description: tool.description,
              inputSchema: tool.inputSchema,
            }
          ])
        ),
      },
    }
  )
);

const app = express();
app.use(express.json());

const router = express.Router();
const MCP_ENDPOINT = '/mcp';
const PORT = process.env.PORT || 3001;

router.post(MCP_ENDPOINT, async (req: Request, res: Response) => {
  await server.handlePostRequest(req, res);
});

router.get(MCP_ENDPOINT, async (req: Request, res: Response) => {
  await server.handleGetRequest(req, res);
});

// Health check endpoint
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'gmail-mcp',
    timestamp: new Date().toISOString(),
    port: PORT
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
  log.success(`MCP endpoint: http://${hostname()}:${PORT}${MCP_ENDPOINT}`);
  log.success(`Press Ctrl+C to stop the server`);
});

// Graceful shutdown handler
let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  log.info(`Received ${signal}, shutting down gracefully...`);

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

    log.info('HTTP server closed to new connections');

    // Give active connections time to complete (max 30 seconds)
    const shutdownTimeout = setTimeout(() => {
      log.warn('Forcefully closing remaining connections after timeout');
      activeSockets.forEach(socket => socket.destroy());
    }, 30000);

    // Wait for all connections to close
    while (activeSockets.size > 0) {
      log.info(`Waiting for ${activeSockets.size} active connection(s) to close...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    clearTimeout(shutdownTimeout);

    // Close MCP server
    await server.close();
    log.info('Server closed gracefully');

    process.exit(0);
  } catch (error) {
    log.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); 