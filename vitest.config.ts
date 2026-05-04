import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    env: { NODE_ENV: 'test' },
    include: ['src/entities/**/*.test.ts', 'src/features/**/*.test.ts', 'src/shared/**/*.test.ts'],
    exclude: ['daemon/**', 'node_modules/**', '**/bun*'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
