import fs from 'node:fs/promises';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { UPLOAD_DIR } from '../src/middleware/upload.js';

let mongod: MongoMemoryServer | null = null;

beforeAll(async () => {
  const localUri = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/hirehive-test';
  try {
    await mongoose.connect(localUri, { serverSelectionTimeoutMS: 2000 });
  } catch {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri('hirehive-test'));
  }
  // Unique indexes are built lazily, so force them before the suite relies on them.
  await Promise.all(Object.values(mongoose.models).map((m) => m.createIndexes()));
});

afterEach(async () => {
  // Wipe documents between tests but keep the indexes, so each test starts clean.
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
  }
  // The apply tests upload real files; leave the uploads directory as we
  // found it rather than accumulating junk on every run.
  await clearUploads();
});

async function clearUploads(): Promise<void> {
  const entries = await fs.readdir(UPLOAD_DIR).catch(() => [] as string[]);
  await Promise.all(
    entries
      .filter((name) => name !== '.gitkeep')
      .map((name) => fs.unlink(`${UPLOAD_DIR}/${name}`).catch(() => {})),
  );
}
