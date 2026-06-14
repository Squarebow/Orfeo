interface MidiIconProps {
  connected: boolean
  size?: number
}

export default function MidiIcon({ connected, size = 22 }: MidiIconProps) {
  const color = connected ? '#e8a027' : '#353545'
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <!-- DIN-5 connector housing: D-shape (circle with flat bottom) -->
  <path d="M4 10 A8 8 0 0 1 20 10 L20 16 Q20 19 17 19 L7 19 Q4 19 4 16 Z"/>
  <!-- 5 pins in DIN-5 layout -->
  <!-- Top center -->
  <circle cx="12" cy="8" r="1" fill="currentColor" stroke="none"/>
  <!-- Upper left -->
  <circle cx="8.5" cy="10.5" r="1" fill="currentColor" stroke="none"/>
  <!-- Upper right -->
  <circle cx="15.5" cy="10.5" r="1" fill="currentColor" stroke="none"/>
  <!-- Lower left -->
  <circle cx="9.5" cy="14" r="1" fill="currentColor" stroke="none"/>
  <!-- Lower right -->
  <circle cx="14.5" cy="14" r="1" fill="currentColor" stroke="none"/>
</svg>

  )
}
