// The one place Vite's worker syntax may appear for the background reader
// (as audio/exportStudioWorkerCtor.ts): handPrescan.ts stays plain TypeScript.
import PrescanWorker from './handPrescan.worker?worker&inline'

export default PrescanWorker
