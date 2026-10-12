import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['tests/globalSetup.ts'],
    setupFiles: ['tests/setup.ts'],
    fileParallelism: false, // all files share one MySQL test database
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
