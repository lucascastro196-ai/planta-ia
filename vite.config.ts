import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // a porta pode vir do ambiente (PORT) para não brigar com outros servidores locais
  server: { port: Number(process.env.PORT) || 5180, strictPort: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
})
