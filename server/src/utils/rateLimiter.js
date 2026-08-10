/**
 * Lightweight, zero-dependency in-memory rate limiter middleware for Express
 */

const requestCounts = new Map();

// Periodic cleanup every 10 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of requestCounts.entries()) {
    if (now > record.resetTime) {
      requestCounts.delete(key);
    }
  }
}, 10 * 60 * 1000);

function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 20, message = "Too many requests, please try again later." }) {
  return (req, res, next) => {
    const key = req.user?.id ? `user:${req.user.id}:${req.path}` : `ip:${req.ip}:${req.path}`;
    const now = Date.now();

    let record = requestCounts.get(key);
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      requestCounts.set(key, record);
      return next();
    }

    record.count += 1;
    if (record.count > max) {
      return res.status(429).json({ error: message, retryAfterSeconds: Math.ceil((record.resetTime - now) / 1000) });
    }

    return next();
  };
}

const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  message: "Too many authentication requests from this IP. Please try again in 15 minutes."
});

const aiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: "Too many AI requests. Please slow down."
});

module.exports = {
  createRateLimiter,
  authRateLimiter,
  aiRateLimiter
};
