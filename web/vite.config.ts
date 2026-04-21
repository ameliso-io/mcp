import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/ameliso.v1.AmelisoService': {
        target: 'http://localhost:50052',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/gen/**', 'src/test-setup.ts', 'src/**/*.test.{ts,tsx}', 'src/__mocks__/**', 'src/client.ts', 'src/main.tsx'],
      thresholds: {
        statements: 98,
        branches: 80,
        functions: 74,
        lines: 98,
      },
    },
  },
})
