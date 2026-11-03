// ── The one place Vite's worker syntax may appear ────────────────────────────
// `?worker&inline` is build syntax, not JavaScript: anything that imports it
// directly can only be loaded by Vite. Keeping it here, in a three-line file,
// leaves the export renderer (`exportStudio.ts`) plain TypeScript, so
// `npm test` can load and exercise its failure paths for real.
import StudioWorker from './exportStudio.worker?worker&inline'

export default StudioWorker
