import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  base: '/games/',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        'lantern-keeper': fileURLToPath(
          new URL('./lantern-keeper/index.html', import.meta.url),
        ),
        'static': fileURLToPath(
          new URL('./static/index.html', import.meta.url),
        ),
        'cart-crate': fileURLToPath(
          new URL('./cart-crate/index.html', import.meta.url),
        ),
        'pocket-dungeon': fileURLToPath(
          new URL('./pocket-dungeon/index.html', import.meta.url),
        ),
        'windup': fileURLToPath(
          new URL('./windup/index.html', import.meta.url),
        ),
      },
      output: {
        // Rollup names a shared chunk after one of the modules inside it. The
        // 1.2 MB vendor chunk was called "phaser" only by luck; adding another
        // module shared by all five games renamed it to that module, which
        // makes a network waterfall very hard to read. Pin the name.
        manualChunks(id: string) {
          if (id.includes('node_modules/phaser')) return 'phaser'
        },
      },
    },
  },
})
