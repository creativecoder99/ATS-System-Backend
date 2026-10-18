import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDB(uri: string = env.MONGO_URI): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
  });
  console.log(`[db] connected to ${mongoose.connection.name}`);
}

export async function disconnectDB(): Promise<void> {
  await mongoose.connection.close();
}
