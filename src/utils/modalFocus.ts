// ── modalFocus — brings the last-clicked modal to the front ──────────────────
// Each modal holds its own zIndex state and calls bringToFront() on mousedown.
// The counter only ever increments so the last-clicked modal always wins.
let _nextZ = 9900
export const MODAL_BASE_Z = 9900
export function bringToFront(): number { return ++_nextZ }
