// ── Custom SVG cursors ──────────────────────────────────────────────────────
// CSS `cursor: url(...)` cannot use CSS variables — color is hardcoded to
// match --text-amber (#e8a027) at the time of writing. If the amber token
// value ever changes, update this literal too.
//
// SVG paths are taken verbatim from lucide-react v0.503.0 (pencil.js).
// Do not hand-edit; re-verify against the installed icon if Lucide is ever upgraded.

const PENCIL_CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e8a027" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>`

// Hotspot (2, 18) places the cursor's "click point" near the pencil tip
// (bottom-left of the icon, matching how Lucide's Pencil is drawn pointing
// down-left). Adjust if it feels visually off during manual testing.
export const PENCIL_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(PENCIL_CURSOR_SVG)}") 2 18, text`
