import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import mongoSanitize from 'express-mongo-sanitize';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { pingDb } from './config/db';
import { logger } from './config/logger';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { apiLimiter } from './middlewares/rateLimit';
import { requestId } from './middlewares/requestId';
import { authRoutes } from './modules/auth/auth.routes';
import { orderRoutes } from './modules/orders/order.routes';
import { statsRoutes } from './modules/stats/stats.routes';
import { settingsRoutes } from './modules/settings/settings';
import { uploadRoutes } from './modules/uploads/upload.routes';
import { serveFile } from './modules/uploads/upload.controller';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.use(requestId);
  app.use(pinoHttp({ logger, genReqId: req => (req as any).id, quietReqLogger: true,
    autoLogging: { ignore: req => req.url === '/healthz' || req.url === '/readyz' } }));
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })); // images are loaded from the web origin
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true, exposedHeaders: ['X-Request-Id', 'Content-Disposition', 'Idempotent-Replayed'] }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(mongoSanitize());

  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  app.get('/readyz', async (_req, res) => {
    const ok = await pingDb();
    res.status(ok ? 200 : 503).json({ status: ok ? 'ready' : 'unavailable' });
  });

  const v1 = express.Router();
  v1.use(apiLimiter);
  v1.use('/auth', authRoutes);
  v1.use('/orders', orderRoutes);
  v1.use('/uploads', uploadRoutes);
  v1.use('/stats', statsRoutes);
  v1.use('/settings', settingsRoutes);
  v1.get('/files/:key', serveFile);
  app.use('/api/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
export const app = createApp();
