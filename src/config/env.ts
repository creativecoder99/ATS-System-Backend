import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  // 4000 rather than the more common 5000: on macOS, port 5000 is taken by
  // the AirPlay Receiver service, so the server silently fails to bind there.
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  MAX_UPLOAD_MB: z.coerce.number().default(5),
});

// Tests boot the app without a .env file, so fall back to throwaway values there.
const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

const parsed = envSchema.safeParse({
  ...process.env,
  ...(isTest
    ? {
        NODE_ENV: 'test',
        MONGO_URI: process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/hiredesk-test',
        JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'test_access_secret_value_1234567890',
        JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'test_refresh_secret_value_1234567890',
      }
    : {}),
});

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // Fail fast and loudly: a half-configured server is worse than one that refuses to start.
  console.error(`\nInvalid environment configuration:\n${issues}\n\nCopy server/.env.example to server/.env and fill it in.\n`);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
