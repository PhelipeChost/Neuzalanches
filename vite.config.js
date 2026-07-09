import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/prototipocompleto/',
  server: {
    proxy: {
      '/prototipocompleto/api': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/prototipocompleto/, ''),
      },
      '/api': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
      },
    },
  },
})
