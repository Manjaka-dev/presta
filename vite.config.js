import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  server: {
    proxy: {
      '/api': {
        // Use VITE_PRESTA_BASE_URL if provided (allows specifying port), fallback to http://localhost
        target: process.env.VITE_PRESTA_BASE_URL || 'http://localhost',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
