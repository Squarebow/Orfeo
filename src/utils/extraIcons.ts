import { createLucideIcon } from 'lucide-react'

// ── Lucide icons newer than the installed lucide-react, drawn the same way (same
// stroke, size and props as every other icon). Lucide is ISC-licensed, already
// listed in THIRD_PARTY_LICENSES.md. When lucide-react is updated past these,
// import them from there instead and delete this file. ─────────────────────────

// "numbers" (lucide 1.70): the Count-in card in Settings
export const Numbers = createLucideIcon('numbers', [
  ['path', { d: 'm10 4 2.6-1.95a.25.25 0 01.4.2V10', key: 'one' }],
  ['path', { d: 'M16 14.535A4 4 0 0118 14a2 2 0 010 4 2 2 0 010 4 4 4 0 01-2-.535', key: 'three' }],
  ['path', { d: 'M8 22H4.5a.5.5 0 01-.5-.5c0-2.68 4-2.932 4-5.5a2 2 0 00-2-2 2.5 2.5 0 00-2 1', key: 'two' }],
])
