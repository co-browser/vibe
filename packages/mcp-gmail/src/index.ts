import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import express, { type Request, type Response } from 'express';
import { StreamableHTTPServer } from './server.js';
// Simple console logger for MCP Gmail
import { hostname } from 'node:os';
import { createServer } from 'node:http';
import { Socket } from 'node:net';
import { GmailTools } from './tools.js';
import { validatePrivyToken } from './middleware/auth.js';

// IPC message types
interface IPCMessage {
  type: string;
}

interface GmailTokensResponseMessage extends IPCMessage {
  type: 'gmail-tokens-response';
  tokens?: any;
  error?: string;
}

const log = {
  info: (msg: string, ...args: any[]) => console.log(`[INFO] [mcp-gmail] ${msg}`, ...args),
  success: (msg: string, ...args: any[]) => console.log(`[SUCCESS] [mcp-gmail] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) => console.warn(`[WARN] [mcp-gmail] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => console.error(`[ERROR] [mcp-gmail] ${msg}`, ...args),
};

// Log startup information
log.info('Gmail MCP server starting...', {
  NODE_VERSION: process.version,
  CWD: process.cwd(),
  PORT: process.env.PORT || 3001,
  PATH: process.env.PATH,
  HOME: process.env.HOME,
});

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

// Apply auth middleware only in cloud mode
if (process.env.USE_LOCAL_GMAIL_SERVER !== 'true') {
  log.info('Running in cloud mode - applying Privy authentication');
  app.use(validatePrivyToken);
} else {
  log.info('Running in local mode - authentication disabled');
}

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

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'gmail-mcp',
    timestamp: new Date().toISOString()
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

    // Give active connections time to complete (max 3 seconds for faster shutdown)
    const shutdownTimeout = setTimeout(() => {
      log.warn('Forcefully closing remaining connections after timeout');
      activeSockets.forEach(socket => socket.destroy());
    }, 3000);

    // Wait for all connections to close
    while (activeSockets.size > 0) {
      log.info(`Waiting for ${activeSockets.size} active connection(s) to close...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    clearTimeout(shutdownTimeout);

    // Force close any remaining sockets
    activeSockets.forEach(socket => {
      try {
        socket.destroy();
      } catch {
        // Ignore errors during force close
      }
    });

    // Close MCP server
    try {
      await server.close();
      log.info('Server closed gracefully');
    } catch (error) {
      log.warn('Error closing server, forcing exit:', error);
    }

    // Force exit after a short delay to ensure cleanup
    setTimeout(() => {
      log.info('Forcing process exit');
      process.exit(0);
    }, 100);
    
    process.exit(0);
  } catch (error) {
    log.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  log.error('Uncaught exception:', error);
  process.exit(1);
});

// Handle IPC messages when running as a child process
if (process.send) {
  log.info('Running as child process, setting up IPC handlers');
  
  process.on('message', (message: unknown) => {
    try {
      // Validate message structure
      if (!message || typeof message !== 'object') {
        log.warn('Received invalid IPC message:', message);
        return;
      }
      
      const ipcMessage = message as IPCMessage;
      log.info('Received IPC message:', ipcMessage.type);
      
      if (ipcMessage.type === 'gmail-tokens-response') {
        // Type guard for gmail-tokens-response
        const gmailMessage = message as GmailTokensResponseMessage;
        
        // Validate message has expected structure
        if (!('tokens' in gmailMessage || 'error' in gmailMessage)) {
          log.warn('Gmail tokens response missing required fields');
          return;
        }
        
        // Emit an event that the token provider can listen to
        // Cast is needed because Node.js doesn't type custom events
        (process as any).emit('gmail-tokens-response', gmailMessage);
      }
    } catch (error) {
      log.error('Error handling IPC message:', error);
    }
  });
}

process.on('unhandledRejection', (reason, _promise) => {
  log.error('Unhandled promise rejection:', reason);
  process.exit(1);
}); 