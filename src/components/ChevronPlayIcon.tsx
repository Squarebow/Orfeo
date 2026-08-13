// ── Rounded-corner play/chevron triangle — shared between ScaleExplorer's
// inversion-step buttons and LockedChordModal's (which used to use the
// generic lucide Play triangle with sharp corners, inconsistent with
// ScaleExplorer's rounded one). ────────────────────────────────────────────
export default function ChevronPlayIcon({ size = 14, mirrored = false }: { size?: number; mirrored?: boolean }) {
  return (
    <svg
      viewBox="0 0 17 26" width={Math.round(size * 17 / 26)} height={size} fill="none" aria-hidden="true"
      style={mirrored ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path
        d="M1,4c0-1.66,1.34-3,3-3,.8,0,1.56.32,2.12.88l9,9c1.17,1.17,1.17,3.07,0,4.24l-9,9c-1.17,1.17-3.07,1.17-4.24,0-.56-.56-.88-1.33-.88-2.12V4Z"
        stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  )
}
