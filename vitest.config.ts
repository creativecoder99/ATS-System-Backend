import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // An in-memory MongoDB binary has to download on first run, and the
    // bcrypt work factor makes auth tests genuinely slow.
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: 'forks',
    // Every file shares one in-memory MongoDB, and afterEach wipes the
    // collections — running files in parallel would let them clear each
    // other's data mid-test.
    fileParallelism: false,
  },
});
