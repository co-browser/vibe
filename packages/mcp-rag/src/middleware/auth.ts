import type { Request, Response, NextFunction } from 'express';
import { PrivyClient } from '@privy-io/server-auth';
import { logger } from "../helpers/logs";

const log = logger('middleware:auth');

// Initialize Privy client only in cloud mode
let privyClient: PrivyClient | null = null;

// Only initialize Privy if we're in cloud mode
if (process.env.USE_LOCAL_RAG_SERVER !== 'true') {
  const appId = process.env.PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!appId || !appSecret) {
    log.error('Missing PRIVY_APP_ID or PRIVY_APP_SECRET environment variables');
    throw new Error('Privy configuration missing');
  }

  log.info(`Initializing Privy client with App ID: ${appId}`);
  privyClient = new PrivyClient(appId, appSecret);
}

/**
 * Middleware to validate Privy OAuth tokens
 * Expects Authorization header with Bearer token
 */
export async function validatePrivyToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!privyClient) {
      log.error('Privy client not initialized - auth middleware should not be called in local mode');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Authentication not configured'
      });
      return;
    }

    // Debug: Log all headers
    log.info('Request headers:', JSON.stringify(req.headers));
    
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      log.warn('Missing or invalid Authorization header');
      log.info('Auth header value:', authHeader || 'undefined');
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization header'
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token with Privy
    try {
      log.info('Verifying token with Privy');
      const claims = await privyClient.verifyAuthToken(token);
      
      // Attach user info to request
      // Note: email may not be available in all auth methods
      req.user = {
        id: claims.userId
        // email is optional and not set here
      };

      log.info(`Authenticated user: ${claims.userId}`);
      next();
    } catch (verifyError: any) {
      log.error('Token verification failed:', {
        error: verifyError.message || verifyError,
        code: verifyError.code,
        statusCode: verifyError.statusCode,
        details: verifyError.response?.data || verifyError.response?.body
      });
      
      // Provide more specific error messages
      let message = 'Invalid or expired token';
      if (verifyError.message?.includes('expired')) {
        message = 'Token has expired';
      } else if (verifyError.message?.includes('invalid')) {
        message = 'Invalid token format or signature';
      }
      
      res.status(401).json({
        error: 'Unauthorized',
        message
      });
      return;
    }
  } catch (error) {
    log.error('Auth middleware error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed'
    });
  }
}

/**
 * Optional middleware for endpoints that don't require auth
 * Still attempts to validate token if present
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!privyClient) {
    // Local mode - no auth needed
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No token provided, continue without auth
    next();
    return;
  }

  // Token provided, validate it
  await validatePrivyToken(req, res, next);
}