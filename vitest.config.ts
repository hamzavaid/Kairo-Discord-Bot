import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@kairo/music-engine': fileURLToPath(
        new URL('./packages/music-engine/src/index.ts', import.meta.url),
      ),
      '@kairo/shared': fileURLToPath(
        new URL('./packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
