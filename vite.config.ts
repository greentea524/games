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
      },
    },
  },
})
