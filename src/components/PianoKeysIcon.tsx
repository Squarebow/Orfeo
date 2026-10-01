// ── Mini piano icon — "show on keyboard" toggle, used in the Console Mixer
// (Master + channel strips), Track Panel, and MIDI Playback Editor. One
// shared component so all four stay visually identical — previously the
// Track Panel and Playback Editor each had their own hand-drawn 4-key copy
// that quietly drifted from the Mixer's 3-key original.
const PianoKeysIcon = ({ width = 15, height = 11 }: { width?: number; height?: number }) => (
  <svg width={width} height={height} viewBox="0 0 13 9" fill="none" aria-hidden="true">
    <rect x="0.5" y="0.5" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="0.9" vectorEffect="non-scaling-stroke"/>
    <rect x="3" y="0.5" width="1.3" height="5" rx="0.4" fill="currentColor"/>
    <rect x="6" y="0.5" width="1.3" height="5" rx="0.4" fill="currentColor"/>
    <rect x="9" y="0.5" width="1.3" height="5" rx="0.4" fill="currentColor"/>
  </svg>
)

export default PianoKeysIcon
