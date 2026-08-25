import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * The `@/*` alias is declared here rather than through vite-tsconfig-paths:
 * that plugin is ESM-only and this config is loaded through `require`, which
 * fails at startup. One explicit alias is simpler and has no such constraint.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    globals: false,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts', 'src/server/**/*.ts'],
    },
  },
});
