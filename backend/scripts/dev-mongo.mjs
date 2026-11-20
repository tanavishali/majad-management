// Docker ke bina local MongoDB (single-node replica set) chalata hai, data backend/.data mein save hota hai.
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dbPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.data', 'mongo');
mkdirSync(dbPath, { recursive: true });
const rs = await MongoMemoryReplSet.create({
  replSet: { name: 'rs0', count: 1, storageEngine: 'wiredTiger' },
  instanceOpts: [{ port: 27017, dbPath }],
});
console.log('MongoDB ready:', rs.getUri('orderdesk'));
process.on('SIGINT', async () => { await rs.stop(); process.exit(0); });
setInterval(() => {}, 1 << 30);
