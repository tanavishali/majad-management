import mongoose from 'mongoose';
import { env } from './env';
import { logger } from './logger';

export async function connectDb(uri = env.MONGO_URI) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { autoIndex: env.autoIndex, serverSelectionTimeoutMS: 10_000 });
  logger.info({ autoIndex: env.autoIndex }, 'mongo connected');
}
export async function disconnectDb() { await mongoose.disconnect(); }
export async function pingDb(): Promise<boolean> {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return false;
  try { await mongoose.connection.db.admin().ping(); return true; } catch { return false; }
}
