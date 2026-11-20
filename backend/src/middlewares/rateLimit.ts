import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const handler = (_req: unknown, res: any) =>
  res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down', requestId: res.getHeader('X-Request-Id') } });

const base = { standardHeaders: true, legacyHeaders: false, handler, skip: () => env.isTest };

export const apiLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 600 });
export const loginLimiter = rateLimit({ ...base, windowMs: 15 * 60_000, limit: 20, skipSuccessfulRequests: true });
export const writeLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 120 });
export const uploadLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 30 });
