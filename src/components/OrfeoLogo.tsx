// ── ORFEO wordmark — inline SVG text, used in the TopBar left section ────────
// `scale`: larger in practice mode's header (same drawing, bigger box)
export default function OrfeoLogo({ scale = 1 }: { scale?: number } = {}) {
  return (
    <svg width={80 * scale} height={22 * scale} viewBox="0 0 80 22" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={scale !== 1 ? { transition: 'width .3s, height .3s', flexShrink: 0 } : undefined}>
      <text
        x="1" y="18"
        fontFamily="var(--font-logo)"
        fontSize="18"
        fontWeight="700"
        letterSpacing="2"
        fill="var(--text-amber)"
      >
        ORFEO
      </text>
    </svg>
  )
}
