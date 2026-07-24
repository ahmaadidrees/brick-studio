import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // The multiplayer relay spike has its own node:test suite (npm test inside
    // experiments/multiplayer/server); keep it out of the browser-style suite.
    exclude: [...configDefaults.exclude, 'experiments/**'],
  },
})
