import { useMidiFile } from '../hooks/useMidiFile'
import { useAppZoomPercent } from '../hooks/useAppZoomPercent'
import OrfeoMark from './OrfeoMark'

// ── Empty state shown when no MIDI file is loaded ────────────────────────────
// Outer div fills the piano-roll area (position:absolute inset:0).
// The content wrapper uses position:fixed so left:50% / top:50% are relative
// to the viewport — the block stays at the true window centre regardless of
// which side drawers (SettingsPanel / TrackPanel) are open or closed.
// position:fixed children are not clipped by the parent's overflow:hidden.
//
// Deliberately exempt from app zoom (Ctrl +/-/0) — this block's own fixed
// CSS-px size (320px watermark + 64px gap + text/button) was sized to fit
// comfortably in the piano-roll area at 100% zoom; app zoom scales the
// whole page uniformly, including this, but the space between the TopBar
// and keyboard does NOT grow to match, so past about 110% zoom it started
// visibly overlapping/getting covered by both, worse the higher you go.
// Countering with an inverse transform: scale() only affects paint-time
// visual size, not the fixed 50%/50% viewport centering point above, so
// this keeps rendering at exactly its 100%-zoom size and position no
// matter what the current app zoom is. ──────────────────────────────────
export default function EmptyState() {
  const { openFile } = useMidiFile()
  const zoomPercent = useAppZoomPercent()
  const counterScale = 100 / zoomPercent

  return (
    <div style={{
      position: 'absolute', inset: 0,
      overflow: 'hidden',
      pointerEvents: 'none',
      userSelect: 'none',
    }}>
      {/* ── Single centred column: watermark → gap → text + button ────────── */}
      <div style={{
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: `translate(-50%, -50%) scale(${counterScale})`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        pointerEvents: 'none',
      }}>

        {/* ── Large watermark mark at ~9% opacity ─────────────────────────── */}
        <OrfeoMark height={320} style={{ opacity: 0.09, flexShrink: 0 }} />

        {/* ── Gap separating watermark from text block ─────────────────────── */}
        <div style={{ height: 64 }} />

        {/* ── Text, button, hint ──────────────────────────────────────────── */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          textAlign: 'center',
          pointerEvents: 'auto',
        }}>
          <span style={{ fontSize: 24, fontWeight: 500, color: 'var(--text-standard)' }}>Let's face the music</span>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            Orfeo supports MIDI, Karaoke, MusicXML, Guitar Pro, and Capella file formats.<br />
            Drag any supported file here, or click Open a file to begin.
          </span>

          <button
            onClick={openFile}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              marginTop: 10,
              padding: '8px 20px',
              borderRadius: 5,
              border: 'none',
              background: 'var(--text-amber)',
              color: 'var(--bg-modal-header)',
              fontSize: 'var(--text-base)', fontWeight: 600, fontFamily: 'var(--font-ui)',
              cursor: 'pointer',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            Open a file
          </button>

          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', marginTop: 2 }}>Ctrl+O</span>
        </div>

      </div>
    </div>
  )
}
