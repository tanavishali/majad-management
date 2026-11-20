/**
 * Obtains a MongoDB for the integration suite. Order of preference:
 *   1. MONGO_TEST_URI   - e.g. `mongodb://localhost:27017` (docker). A throwaway database
 *                         `orderdesk_it_<random>` is used on that server and dropped afterwards.
 *   2. mongodb-memory-server (honours MONGOMS_SYSTEM_BINARY=/path/to/mongod, MONGOMS_VERSION, ...)
 * If neither works, `uri` is null and `reason` explains why; the suite then skips itself.
 */
import { randomBytes } from 'node:crypto';

export interface MongoHandle { uri: string | null; dbName: string; reason: string; stop: () => Promise<void> }

function withDb(uri: string, db: string): string {
  const m = /^(mongodb(?:\+srv)?:\/\/[^/?]+)(\/[^?]*)?(\?.*)?$/.exec(uri);
  if (!m) throw new Error(`Unparseable MONGO_TEST_URI: ${uri}`);
  return `${m[1]}/${db}${m[3] ?? ''}`;
}

export async function obtainMongo(): Promise<MongoHandle> {
  const dbName = `orderdesk_it_${randomBytes(4).toString('hex')}`;
  const external = process.env.MONGO_TEST_URI;
  if (external) {
    return { uri: withDb(external, dbName), dbName, reason: '', stop: async () => undefined };
  }
  try {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const mms = await MongoMemoryServer.create({ instance: { dbName } });
    return { uri: mms.getUri(dbName), dbName, reason: '', stop: async () => { await mms.stop(); } };
  } catch (e) {
    const msg = (e as Error).message.split('\n')[0];
    return {
      uri: null, dbName,
      reason: `No MongoDB available (${msg}). Set MONGO_TEST_URI=mongodb://localhost:27017 (docker run -p 27017:27017 mongo:7) or MONGOMS_SYSTEM_BINARY=/path/to/mongod to run the integration suite.`,
      stop: async () => undefined,
    };
  }
}
