// ── MIDI wordmark logo — viewBox trimmed to glyph bounds (x 137–849 of 1000) ─
// Trimming eliminates the ~13% internal whitespace on both sides so that the
// SVG element's left edge sits flush with the visual left edge of the M glyph.
// This makes left-aligning the icon with a label below it visually accurate.
const MidiIcon = ({ size = 24, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    height={size}
    width={Math.round(size * (712 / 455))}
    viewBox="137 0 712 455"
    fill={color}
  >
    <path d="M137,96h233c19.6,0,31,16.9,31,37v229h-65v-199h-38v199h-59v-199h-37v199h-65V96Z" />
    <rect x="433" y="96" width="65" height="266" />
    <path d="M529,96h193c19.6,0,31,16.9,31,37v196c0,24.9-10.4,33-33,33h-191v-169h66v104h93v-141h-159v-60Z" />
    <rect x="783" y="96" width="66" height="266" />
  </svg>
)

export default MidiIcon
