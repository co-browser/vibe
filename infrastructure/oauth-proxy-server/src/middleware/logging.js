import logger from '../utils/logger.js';

export const requestLogger = (req, res, next) => {
  // Filter sensitive data from query and body
  const sanitizeObject = (obj) => {
    if (!obj) return obj;
    const sensitive = ['code', 'token', 'access_token', 'refresh_token', 'client_secret', 'state'];
    return Object.entries(obj).reduce((acc, [key, value]) => {
      acc[key] = sensitive.some(s => key.toLowerCase().includes(s)) ? '[REDACTED]' : value;
      return acc;
    }, {});
  };

  // Log request details
  logger.info('HTTP Request', {
    method: req.method,
    path: req.path,
    headers: {
      origin: req.headers.origin,
      cookie: req.headers.cookie ? 'present' : 'absent',
      'content-type': req.headers['content-type']
    },
    sessionId: req.sessionID,
    query: sanitizeObject(req.query),
    body: sanitizeObject(req.body),
    ip: req.ip || req.connection.remoteAddress
  });

  // Track response time
  const startTime = Date.now();
  
  // Override res.end to log response details
  const originalEnd = res.end;
  res.end = function(...args) {
    const responseTime = Date.now() - startTime;
    
    logger.info('HTTP Response', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      sessionId: req.sessionID
    });
    
    originalEnd.apply(res, args);
  };

  next();
};