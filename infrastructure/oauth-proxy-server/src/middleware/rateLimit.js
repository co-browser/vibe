import rateLimit from "express-rate-limit";

// Default rate limiter configuration
const defaultConfig = {
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  // Use custom key generator that works with proxies
  keyGenerator: req => {
    // Check for Cloudflare's real IP header first
    if (req.headers["cf-connecting-ip"]) {
      return req.headers["cf-connecting-ip"];
    }

    // Other useful Cloudflare headers:
    // - 'cf-ipcountry': Country code of the client
    // - 'cf-ray': Unique request identifier
    // - 'x-forwarded-for': Standard proxy header (but Cloudflare adds its own IPs)

    // Fall back to standard proxy headers
    // req.ip already respects the 'trust proxy' setting and handles X-Forwarded-For
    // Use req.socket.remoteAddress as fallback (req.connection is deprecated)
    return req.ip || req.socket.remoteAddress;
  },
  handler: (request, response) => {
    response.status(429).json({
      error: "Too many requests",
      message: "You have exceeded the rate limit. Please try again later.",
      retryAfter: request.rateLimit.resetTime,
    });
  },
};

// General rate limiter for all /auth routes
export const createRateLimiter = () => {
  return rateLimit({
    ...defaultConfig,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 20, // More restrictive default
    skip: req => {
      // Skip rate limiting for health checks
      return req.path === "/health" || req.path === "/auth/health";
    },
  });
};

// Stricter rate limiter for OAuth authorize endpoint
export const createAuthorizeRateLimiter = () => {
  return rateLimit({
    ...defaultConfig,
    max: parseInt(process.env.RATE_LIMIT_AUTHORIZE_MAX) || 10, // Max 10 authorize attempts
    message: "Too many authorization attempts. Please try again later.",
  });
};

// Rate limiter for OAuth callback endpoint
export const createCallbackRateLimiter = () => {
  return rateLimit({
    ...defaultConfig,
    max: parseInt(process.env.RATE_LIMIT_CALLBACK_MAX) || 10, // Max 10 callback attempts
    message: "Too many callback attempts. Please try again later.",
  });
};

// Very strict rate limiter for token endpoint
export const createTokenRateLimiter = () => {
  return rateLimit({
    ...defaultConfig,
    max: parseInt(process.env.RATE_LIMIT_TOKENS_MAX) || 5, // Max 5 token requests
    message: "Too many token requests. Please try again later.",
  });
};
