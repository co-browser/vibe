import rateLimit from 'express-rate-limit';

export const createRateLimiter = () => {
  return rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // Default to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    // Use custom key generator that works with proxies
    keyGenerator: (req) => {
      // Trust X-Forwarded-For header from proxy
      return req.ip || req.connection.remoteAddress;
    },
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health' || req.path === '/auth/health';
    },
    handler: (request, response) => {
      response.status(429).json({
        error: 'Too many requests',
        message: 'You have exceeded the rate limit. Please try again later.',
        retryAfter: request.rateLimit.resetTime
      });
    }
  });
};