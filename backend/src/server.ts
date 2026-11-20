import { app } from './app';
import { connectDb, disconnectDb } from './config/db';
import { env } from './config/env';
import { logger } from './config/logger';
import { authService } from './modules/auth/auth.service';
import { OrderModel } from './modules/orders/order.model';

async function main() {
  await connectDb();
  // drop indexes left over from the previous order schema (source/address/text) and build the current ones
  await OrderModel.syncIndexes().catch(err => logger.warn({ err }, 'order index sync failed'));
  await authService.ensureAdmin(env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
  const server = app.listen(env.PORT, () => logger.info({ port: env.PORT, env: env.NODE_ENV }, 'api listening'));

  let closing = false;
  const shutdown = (reason: string, code = 0) => {
    if (closing) return; closing = true;
    logger.info({ reason }, 'shutting down');
    const force = setTimeout(() => { logger.error('forced exit'); process.exit(1); }, 10_000);
    force.unref();
    server.close(async () => {
      try { await disconnectDb(); } catch (err) { logger.error({ err }, 'disconnect failed'); }
      process.exit(code);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', err => { logger.fatal({ err }, 'unhandledRejection'); shutdown('unhandledRejection', 1); });
  process.on('uncaughtException', err => { logger.fatal({ err }, 'uncaughtException'); shutdown('uncaughtException', 1); });
}
main().catch(err => { logger.fatal({ err }, 'startup failed'); process.exit(1); });
