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
      exclude: ['src/gen/**', 'src/test-setup.ts'],
      thresholds: {
        statements: 95,
        branches: 81,
        functions: 60,
        lines: 95,
      },
    },
  },
})
