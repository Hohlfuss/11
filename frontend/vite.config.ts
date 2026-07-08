import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      // You must add this block so Vite knows how to route the WebSockets!
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      }
    }
  }
})