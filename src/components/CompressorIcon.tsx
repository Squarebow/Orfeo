// ── Compressor on/off icon — rounded-square cap around a simplified
// compression-curve glyph (flat, then rising). Matches the app's other
// custom stroke icons (see ChevronPlayIcon.tsx): currentColor stroke so the
// parent button's color controls it directly — dark (--text-icon-inactive)
// when off, amber (--text-amber) when on, same mechanism as every other
// IBtn icon in the Mixer, no separate color prop needed. ────────────────────
export default function CompressorIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 33.48 32.44" width={Math.round(size * (33.48 / 32.44))} height={size}
      fill="none" aria-hidden="true"
    >
      <rect x="4.32" y="3.8" width="24.84" height="24.84" rx="2" ry="2"
        stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="11 20.92 14.04 20.92 19.44 11.52 22.49 11.52"
        stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
