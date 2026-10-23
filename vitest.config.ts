import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/*.test.ts'], fileParallelism: false, setupFiles: ['tests/setup.ts'], testTimeout: 20000 }, resolve: { alias: { '@': new URL('.', import.meta.url).pathname } } });
