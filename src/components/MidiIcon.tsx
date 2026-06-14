const MidiIcon = ({ size = 24, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 25.5 25.66"
    fill="none"
    stroke={color}
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12.75.75C6.12.75.75,6.32.75,13.19c0,5.25,3.13,9.74,7.57,11.56,1.04-1.34,2.64-2.2,4.43-2.2s3.39.86,4.43,2.2c4.43-1.83,7.57-6.32,7.57-11.56C24.75,6.32,19.38.75,12.75.75Z" />
    <circle cx="4.63"  cy="12.32" r="2" fill={color} stroke="none" />
    <circle cx="7.31"  cy="7.09"  r="2" fill={color} stroke="none" />
    <circle cx="12.75" cy="4.73"  r="2" fill={color} stroke="none" />
    <circle cx="18.19" cy="7.09"  r="2" fill={color} stroke="none" />
    <circle cx="20.88" cy="12.32" r="2" fill={color} stroke="none" />
  </svg>
)

export default MidiIcon
