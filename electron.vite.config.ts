import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { readFileSync } from 'fs'

// ── App version, read once at build time so the Settings "About" section
// never drifts from package.json — no manual edit needed on every bump. ────
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: 'electron/main.ts',
      },
      // pdfkit uses __dirname to locate its font .afm files; bundling it inline
      // would break that (resolves to out/main/ instead of node_modules/pdfkit/js/).
      // Keep it as a runtime require() so its own __dirname stays correct.
      rollupOptions: {
        external: ['pdfkit'],
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
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [
      react(),
    ],
    // Exclude spessasynth from pre-bundling (large native-ESM, dynamic import).
    // Include fuse.js so it is pre-bundled at dev server start and doesn't
    // trigger a mid-session dep-optimisation reload when ChordExplorer mounts.
    optimizeDeps: {
      exclude: ['spessasynth_lib', 'spessasynth_core'],
      include: ['fuse.js'],
    },
    server: {
      watch: {
        ignored: ['**/release/**'],
      },
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