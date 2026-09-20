import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    // 精度検証（just eval-jev）は実 API を叩くため本体テストから外す（Constitution IV）
    exclude: ['**/node_modules/**', 'src/lib/jev/__eval__/**'],
  },
  resolve: {
    alias: { '@': new URL('./src/', import.meta.url).pathname },
  },
});
