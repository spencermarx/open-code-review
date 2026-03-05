import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist/client',
    target: 'es2022',
  },
  server: {
    proxy: {
      '/api': 'http://localhost:4173',
      '/socket.io': {
        target: 'http://localhost:4173',
        ws: true,
      },
    },
  },
})
