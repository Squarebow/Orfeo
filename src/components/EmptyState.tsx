import { useMidiFile } from '../hooks/useMidiFile'

// Inline the O logo SVG (simplified paths from Orfeo_O_logo_icon-01.svg)
function OrfeoOIcon({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fill="#e8a027" d="M115.3,191.15c-2.76,0-4.91-1.53-4.92-4.34l-.05-11.71c-.02-3.66-3.15-6.86-6.87-6.87l-20.58-.07c-2.47,0-3.95-1.68-4.65-3.89l-6.9-21.9c-.79-2.51.87-5.46,3.63-5.46l28.33-.09c3.83-.01,6.9-3.17,7.1-6.98s-2.75-7.55-6.63-7.57l-20.91-.1c-1.94,0-3.63-1.17-4.23-3.05l-7.27-22.73c-.78-2.45.8-5.47,3.52-5.48l28.42-.11c3.77-.01,7.03-3.16,7.06-6.89l.08-11.89c.02-2.22,1.84-4.15,4.17-4.15h55.7c2.08,0,3.5,1.43,4.1,3.3l7.14,22.15c.45,1.39.43,2.71-.45,4-.61.89-1.77,1.8-3.22,1.8l-63.66.04c-4.02,0-7.07,3.5-7.08,7.28s3.04,7.34,7.04,7.34l55.8.03c1.74,0,3.66.86,4.23,2.64l7.52,23.46c.73,2.27-1.2,5.13-3.65,5.13l-63.69.06c-2.86,0-5.43,1.78-6.58,4.3-1.02,2.24-.88,4.78.48,6.96,1.07,1.71,3.21,3.41,5.62,3.41l56.43.06c2.28,0,3.62,1.8,4.23,3.71l6.98,21.66c.45,1.39.49,2.74-.42,4.02-.65.91-1.77,1.87-3.23,1.87l-62.57.04Z"/>
      <path fill="#e8a027" d="M246.47,128c0,25-5.06,47.1-15.17,66.31-10.12,19.21-24.09,34.21-41.93,45-17.84,10.8-38.47,16.19-61.88,16.19s-43.35-5.4-61.19-16.19c-17.84-10.79-31.76-25.74-41.76-44.83-10-19.09-15-41.25-15-66.48s5.05-47.04,15.17-66.14c10.11-19.09,24.03-34.09,41.76-45C84.19,5.96,104.65.5,127.83.5s43.98,5.46,61.7,16.36c17.73,10.91,31.65,25.91,41.76,45,10.11,19.09,15.17,41.14,15.17,66.14ZM211.35,128c0-19.09-3.47-35.8-10.4-50.11-6.94-14.32-16.65-25.4-29.15-33.24-12.5-7.84-27.16-11.76-43.98-11.76s-31.14,3.92-43.64,11.76c-12.5,7.84-22.22,18.92-29.15,33.24-6.94,14.32-10.4,31.02-10.4,50.11s3.46,35.8,10.4,50.11c6.93,14.32,16.65,25.46,29.15,33.41,12.5,7.96,27.04,11.93,43.64,11.93s31.48-4.03,43.98-12.1c12.5-8.06,22.21-19.26,29.15-33.58,6.93-14.32,10.4-30.91,10.4-49.77Z"/>
    </svg>
  )
}

export default function EmptyState() {
  const { openFile } = useMidiFile()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 20, userSelect: 'none' }}>
      <OrfeoOIcon size={72} />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: '#707088' }}>No file open</span>
        <span style={{ fontSize: 12, color: '#404055' }}>Open a .mid or .midi file to get started</span>
      </div>

      <button
        onClick={openFile}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 20px',
          borderRadius: 5,          // 4-6px as requested
          border: 'none',
          background: '#e8a027',
          color: '#0f0f12',
          fontSize: 13, fontWeight: 600, fontFamily: 'Inter',
          cursor: 'pointer',
          transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        Open MIDI file
      </button>

      <span style={{ fontSize: 11, color: '#2a2a38' }}>Ctrl+O</span>
    </div>
  )
}
