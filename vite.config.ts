import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173, open: true },
  build: { target: 'es2020' },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
} as any);
