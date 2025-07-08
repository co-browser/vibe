export const requestLogger = (req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
    headers: {
      origin: req.headers.origin,
      cookie: req.headers.cookie ? 'present' : 'absent',
      'content-type': req.headers['content-type']
    },
    sessionId: req.sessionID,
    query: req.query,
    body: req.body
  });
  next();
};