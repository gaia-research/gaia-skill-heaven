import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Prototype landing page. Base './' keeps it deployable to any static host
// (Cloudflare Pages, GitHub Pages) without path assumptions.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5178, open: true },
})
