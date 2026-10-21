/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { apiPlugin } from './scripts/vite-api-plugin.ts'

export default defineConfig({
  plugins: [react(), apiPlugin()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'api/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts', 'api/**/*.ts'],
      exclude: ['**/*.test.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 98, functions: 96, branches: 95, statements: 98 },
    },
  },
})
