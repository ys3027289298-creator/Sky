/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { open: true, port: 5173 },
  build: { target: 'es2020', chunkSizeWarningLimit: 1500 },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
