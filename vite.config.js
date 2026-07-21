import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Broad compatibility: iOS Safari 11+, old Android Chrome/WebView, tablets
    target: ['es2015', 'safari11', 'chrome58', 'firefox57'],
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
  },
  esbuild: {
    target: 'safari11',
  },
})
