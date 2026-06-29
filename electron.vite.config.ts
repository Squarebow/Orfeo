import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: 'electron/main.ts',
      },
    },
  },
  preload: {
    build: {
      lib: {
        entry: 'electron/preload.ts',
        formats: ['cjs'],
        fileName: () => 'preload.js',
      },
    },
  },
  renderer: {
    root: '.',
    plugins: [
      react(),
      tailwindcss(),
    ],
    // Exclude spessasynth from pre-bundling (large native-ESM, dynamic import).
    // Include fuse.js so it is pre-bundled at dev server start and doesn't
    // trigger a mid-session dep-optimisation reload when ChordExplorer mounts.
    optimizeDeps: {
      exclude: ['spessasynth_lib', 'spessasynth_core'],
      include: ['fuse.js'],
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html'),
        },
      },
    },
  },
})