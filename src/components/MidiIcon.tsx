interface MidiIconProps {
  connected: boolean
  size?: number
}

export default function MidiIcon({ connected, size = 22 }: MidiIconProps) {
  const color = connected ? '#e8a027' : '#353545'
  return (
    <svg width={size} height={size} viewBox="0 0 800 800" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="400" cy="168.072" r="40" stroke={color} strokeMiterlimit="133.333" strokeWidth="42.382"/>
      <circle cx="614.652" cy="361.138" r="40" stroke={color} strokeMiterlimit="133.333" strokeWidth="42.382"/>
      <circle cx="185.711" cy="361.138" r="40" stroke={color} strokeMiterlimit="133.333" strokeWidth="42.382"/>
      <circle cx="543.66" cy="228.17" r="40" stroke={color} strokeMiterlimit="133.333" strokeWidth="42.382"/>
      <circle cx="256.34" cy="228.17" r="40" stroke={color} strokeMiterlimit="133.333" strokeWidth="42.382"/>
      <path
        d="M400,66.667c-174.89,0-316.667,141.776-316.667,316.667,0,133.592,82.729,247.855,199.748,294.373,27.494-34.169,69.649-56.041,116.919-56.041s89.425,21.872,116.919,56.041c117.018-46.518,199.748-160.78,199.748-294.373,0-174.89-141.776-316.667-316.667-316.667Z"
        stroke={color} strokeMiterlimit="133.333" strokeWidth="50"
      />
    </svg>
  )
}
