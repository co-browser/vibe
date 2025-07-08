import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { corsMiddleware } from './middleware/cors.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { requestLogger } from './middleware/logging.js';
import authRoutes from './routes/auth-simple.js';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Trust proxy - required for Coolify/Cloudflare
app.set('trust proxy', true);

// Health check endpoint - before any middleware
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS
app.use(corsMiddleware());

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cookie parser middleware
app.use(cookieParser());

// Request logging middleware
app.use(requestLogger);

// Session configuration
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error('SESSION_SECRET environment variable is required');
}

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production' && process.env.FORCE_SECURE_COOKIES === 'true',
    httpOnly: true,
    maxAge: 15 * 60 * 1000, // 15 minutes
    sameSite: 'lax',
    path: '/'
  },
  name: 'vibe-oauth-session'
}));

// Rate limiting
const rateLimiter = createRateLimiter();
app.use('/auth', rateLimiter);

// Routes
app.use('/auth', authRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Vibe OAuth Proxy Server',
    version: '1.0.0',
    endpoints: [
      'GET /health',
      'GET /auth/health',
      'GET /auth/gmail/authorize',
      'GET /auth/gmail/callback'
    ]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  // Log error details server-side only
  console.error('Error:', {
    message: err.message,
    status: err.status,
    // Only log stack trace in development
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
  
  res.status(err.status || 500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: 'The requested endpoint does not exist'
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`OAuth proxy server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});