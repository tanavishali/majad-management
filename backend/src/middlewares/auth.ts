import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

export interface AccessPayload { sub: string; username: string }

export function signAccessToken(user: { id: string; username: string }): string {
  return jwt.sign({ username: user.username }, env.JWT_SECRET, {
    subject: user.id, expiresIn: `${env.ACCESS_TOKEN_MINUTES}m`, algorithm: 'HS256',
  });
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const h = req.header('authorization') ?? '';
  const m = /^Bearer (.+)$/i.exec(h);
  if (!m) return next(AppError.unauthorized());
  try {
    const p = jwt.verify(m[1]!, env.JWT_SECRET, { algorithms: ['HS256'] }) as AccessPayload;
    req.user = { id: p.sub, username: p.username };
    next();
  } catch {
    next(AppError.unauthorized('Invalid or expired token'));
  }
};
