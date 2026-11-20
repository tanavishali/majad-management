/** Creates/syncs all indexes (use in production where autoIndex is off). `npm run indexes` */
import { connectDb, disconnectDb } from '../config/db';
import { logger } from '../config/logger';
import { SessionModel, UserModel } from '../modules/auth/auth.model';
import { CounterModel, IdempotencyModel, OrderModel } from '../modules/orders/order.model';

async function main() {
  await connectDb();
  for (const m of [OrderModel, CounterModel, IdempotencyModel, UserModel, SessionModel]) {
    const dropped = await m.syncIndexes();
    const idx = await m.listIndexes();
    logger.info({ model: m.modelName, dropped, indexes: idx.map((i: any) => i.name) }, 'indexes synced');
    console.log(`${m.modelName}: ${idx.map((i: any) => i.name).join(', ')}`);
  }
  await disconnectDb();
}
main().catch(err => { console.error(err); process.exit(1); });
