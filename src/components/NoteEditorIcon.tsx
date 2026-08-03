// ── Note editor icon — stylized piano-roll dots, custom-designed to replace
// the generic lucide SquarePen for the "enter note edit mode" toggle.
// Sourced from public/midi-editor.svg; ported inline (currentColor instead
// of the original hardcoded #000) so it colors like every other icon here.
const NoteEditorIcon = ({ size = 24, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth={strokeWidth}
    strokeLinecap="round" strokeLinejoin="round"
  >
    <circle cx="12" cy="5" r="1" />
    <circle cx="19" cy="5" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="19" r="1" />
    <circle cx="5" cy="19" r="1" />
    <rect x="4" y="4" width="2" height="8.61" rx="1" ry="1" />
    <rect x="18" y="11.39" width="2" height="8.61" rx="1" ry="1" />
  </svg>
)

export default NoteEditorIcon
