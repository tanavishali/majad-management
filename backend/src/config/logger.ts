import pino from 'pino';
import { env } from './env';

export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
  ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
});
