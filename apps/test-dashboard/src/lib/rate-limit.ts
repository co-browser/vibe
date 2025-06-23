import { NextApiRequest, NextApiResponse } from 'next';

interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  statusCode?: number;
}

interface RequestInfo {
  count: number;
  resetTime: number;
}

// In-memory store for rate limiting (in production, use Redis or similar)
const requestCounts = new Map<string, RequestInfo>();

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // 100 requests per window
  message: 'Too many requests from this IP, please try again later.',
  statusCode: 429,
};

/**
 * Get client IP address from request
 */
function getClientIp(req: NextApiRequest): string {
  const forwarded = req.headers['x-forwarded-for'] as string;
  const ip = forwarded ? forwarded.split(',')[0] : req.socket.remoteAddress;
  return ip || 'unknown';
}

/**
 * Clean up expired rate limit entries
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, info] of requestCounts.entries()) {
    if (now > info.resetTime) {
      requestCounts.delete(key);
    }
  }
}

/**
 * Rate limiting middleware for API routes
 */
export function createRateLimit(config: Partial<RateLimitConfig> = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return function rateLimit(
    req: NextApiRequest,
    res: NextApiResponse,
    next?: () => void
  ): boolean {
    const clientIp = getClientIp(req);
    const now = Date.now();
    const resetTime = now + finalConfig.windowMs;

    // Clean up expired entries periodically
    if (Math.random() < 0.01) { // 1% chance to cleanup
      cleanupExpiredEntries();
    }

    // Get or create request info for this IP
    let requestInfo = requestCounts.get(clientIp);

    if (!requestInfo || now > requestInfo.resetTime) {
      // First request or window expired
      requestInfo = {
        count: 1,
        resetTime,
      };
      requestCounts.set(clientIp, requestInfo);
    } else {
      // Increment count for existing window
      requestInfo.count++;
    }

    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', finalConfig.max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, finalConfig.max - requestInfo.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(requestInfo.resetTime / 1000));

    // Check if limit exceeded
    if (requestInfo.count > finalConfig.max) {
      res.status(finalConfig.statusCode!).json({
        error: finalConfig.message,
        retryAfter: Math.ceil((requestInfo.resetTime - now) / 1000),
      });
      return false;
    }

    // Call next middleware if provided
    if (next) {
      next();
    }

    return true;
  };
}

/**
 * Advanced rate limiting with different limits for different endpoints
 */
export function createAdvancedRateLimit() {
  const authLimit = createRateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 auth attempts per 15 minutes
    message: 'Too many authentication attempts, please try again later.',
  });

  const tokenLimit = createRateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 token requests per minute
    message: 'Too many token generation requests, please try again later.',
  });

  const generalLimit = createRateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per 15 minutes
    message: 'Too many requests, please try again later.',
  });

  return {
    auth: authLimit,
    token: tokenLimit,
    general: generalLimit,
  };
}

/**
 * Get rate limit status for an IP
 */
export function getRateLimitStatus(ip: string): {
  requests: number;
  limit: number;
  remaining: number;
  resetTime: number;
} {
  const requestInfo = requestCounts.get(ip);
  const limit = DEFAULT_CONFIG.max;

  if (!requestInfo) {
    return {
      requests: 0,
      limit,
      remaining: limit,
      resetTime: Date.now() + DEFAULT_CONFIG.windowMs,
    };
  }

  return {
    requests: requestInfo.count,
    limit,
    remaining: Math.max(0, limit - requestInfo.count),
    resetTime: requestInfo.resetTime,
  };
}

/**
 * Reset rate limit for an IP (admin function)
 */
export function resetRateLimit(ip: string): void {
  requestCounts.delete(ip);
}

/**
 * Get all rate limit stats (admin function)
 */
export function getAllRateLimitStats(): Array<{
  ip: string;
  requests: number;
  resetTime: number;
}> {
  const stats: Array<{
    ip: string;
    requests: number;
    resetTime: number;
  }> = [];

  for (const [ip, info] of requestCounts.entries()) {
    stats.push({
      ip,
      requests: info.count,
      resetTime: info.resetTime,
    });
  }

  return stats.sort((a, b) => b.requests - a.requests);
}