// ── Songs being dragged out of the Library right now — so places outside the
// Library panel (the top bar's practice queue) can take them on drop. The
// Library sets this on drag start and clears it when the drag ends. ─────────
let dragging: string[] | null = null

export function setLibraryDragPaths(paths: string[] | null) { dragging = paths && paths.length ? paths : null }
export function getLibraryDragPaths(): string[] | null { return dragging }
