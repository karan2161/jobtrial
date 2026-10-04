import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const body = (code, message) => ({ success: false, error: { code, message } });

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: env.RATE_LIMIT_GENERAL, standardHeaders: true, legacyHeaders: false,
  message: body('RATE_LIMITED', 'Too many requests. Please slow down.'),
});

/** Stricter, per authenticated user. Mount AFTER authenticate. */
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000, limit: env.RATE_LIMIT_AI, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip,
  message: body('AI_RATE_LIMITED', 'AI request limit reached. Try again in a minute.'),
});

/** Brute-force protection for login / signup / password reset, per IP. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  message: body('AUTH_RATE_LIMITED', 'Too many attempts. Try again later.'),
});
