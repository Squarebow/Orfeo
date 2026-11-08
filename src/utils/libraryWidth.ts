// ── How wide the Library tab may be. Today's width is the narrowest, and dragging
// the panel's edge adds up to a quarter more. The extra only comes out of room the
// window has beyond its smallest size (900 wide, in the app's own zoomed units),
// so the piano roll never gets less space than it had before this existed. Setup
// and the Track panel keep the fixed width. ───────────────────────────────────

export const LIBRARY_MIN_WIDTH = 260
export const LIBRARY_MAX_WIDTH = 325   // +25 %
const SMALLEST_WINDOW = 900            // BrowserWindow minWidth in main.ts

/** A remembered or dragged width, kept inside the range. */
export function clampLibraryWidth(w: number): number {
  if (!Number.isFinite(w)) return LIBRARY_MIN_WIDTH
  return Math.round(Math.min(LIBRARY_MAX_WIDTH, Math.max(LIBRARY_MIN_WIDTH, w)))
}

/** The width actually used: the chosen one, as far as this window has room for it. */
export function libraryPanelWidth(chosen: number, windowWidth: number): number {
  const room = LIBRARY_MIN_WIDTH + Math.max(0, windowWidth - SMALLEST_WINDOW)
  return Math.min(clampLibraryWidth(chosen), room)
}
