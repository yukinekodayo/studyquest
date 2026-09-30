import { defineConfig } from 'vitest/config';
import path from 'node:path';

const alias = { '@': path.resolve(import.meta.dirname, 'src') };

export default defineConfig({
  test: {
    projects: [
      {
        // 純粋ロジック(DB不要)
        resolve: { alias },
        test: { name: 'unit', include: ['tests/unit/**/*.test.ts'] },
      },
      {
        // PostgreSQL 16 を一時起動して、マイグレーション(RLS・RPC)を実DBで検証
        resolve: { alias },
        test: {
          name: 'db',
          include: ['tests/db/**/*.test.ts'],
          globalSetup: ['tests/db/globalSetup.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
