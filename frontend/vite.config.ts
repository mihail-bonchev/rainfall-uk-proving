import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Vite doesn't run Vercel functions; in dev, use the deployed /api.
  server: {
    proxy: { '/api': { target: 'https://rain.xelantis.com', changeOrigin: true } },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('maplibre-gl') || id.includes('react-map-gl')) return 'vendor-map'
          if (id.includes('recharts')) return 'vendor-ui'
          if (id.includes('@tanstack/react-query')) return 'vendor-query'
        },
      },
    },
  },
})
