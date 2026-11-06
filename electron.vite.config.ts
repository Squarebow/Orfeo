import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { readFileSync } from 'fs'

// ── App version, read once at build time so the Settings "About" section
// never drifts from package.json — no manual edit needed on every bump. ────
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))

// ── The version being worked towards, shown beside the real one in dev runs:
// new features waiting in the changelog mean the next minor version, fixes
// alone the next patch. Display form: 1.7, not 1.7.0. ────────────────────────
function nextVersion(version: string): string {
  const [major, minor, patch] = version.split('.').map(Number)
  const log = readFileSync(resolve(__dirname, 'docs/CHANGELOG.md'), 'utf-8')
  const unreleased = log.split('## [Unreleased]')[1]?.split(/^## \[/m)[0] ?? ''
  return /^### New/m.test(unreleased) ? `${major}.${minor + 1}` : `${major}.${minor}.${patch + 1}`
}

export default defineConfig({
  main: {
    build: {
      lib: {
        // main.js + the native audio engine's utility process (audioHost.js)
        entry: { main: 'electron/main.ts', audioHost: 'electron/audioHost.ts' },
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
      __NEXT_VERSION__: JSON.stringify(nextVersion(pkg.version)),
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
    // electron-vite defaults the renderer build to minify: false — without
    // this override the whole renderer bundle ships unminified (readable
    // source, full whitespace, every dependency's comments verbatim).
    // legalComments: 'inline' keeps license/copyright banners (GSAP's
    // /*! ... @license ... */ header included) embedded in the output
    // rather than relying on esbuild's own default, which can differ by
    // version — this pins it explicitly.
    esbuild: {
      legalComments: 'inline',
    },
    build: {
      minify: 'esbuild',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html'),
        },
      },
    },
  },
})