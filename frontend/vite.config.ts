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
        target: 'https://one1-x2mf.onrender.com/',
        changeOrigin: true,
        secure: false,
      },
      // You must add this block so Vite knows how to route the WebSockets!
      '/socket.io': {
        target: 'https://one1-x2mf.onrender.com/',
        ws: true,
      }
    }
  }
})