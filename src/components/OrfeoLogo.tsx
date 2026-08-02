// ── ORFEO wordmark — inline SVG text, used in the TopBar left section ────────
export default function OrfeoLogo() {
  return (
    <svg width="80" height="22" viewBox="0 0 80 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text
        x="1" y="18"
        fontFamily="'Inter', 'Georgia', serif"
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
