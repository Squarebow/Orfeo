import { Settings2, ChevronLeft, Type, Piano, Palette, ZoomIn, Volume2 } from 'lucide-react'
import { useStore } from '../../store'
import type { NoteNaming, KeyboardSize, Accidentals } from '../../types'

// ─── Reusable sub-components ────────────────────────────────────────────────

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '5px 10px',
      background: '#0e0e16',
      borderTop: '1px solid #1a1a26',
      borderBottom: '1px solid #1a1a26',
    }}>
      <span style={{ color: '#50506a', display: 'flex', alignItems: 'center' }}>{icon}</span>
      <span style={{
        flex: 1, fontSize: 10, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.1em', color: '#707088',
      }}>
        {label}
      </span>
    </div>
  )
}

function OptionRow({
  label, children, hint,
}: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{
      padding: '10px 14px',
      borderBottom: '1px solid #181822',
    }}>
      <div style={{
        fontSize: 11, color: '#707088', marginBottom: 6,
        fontWeight: 500, letterSpacing: '0.02em',
      }}>
        {label}
      </div>
      {children}
      {hint && (
        <div style={{ fontSize: 9, color: '#404055', marginTop: 5, fontFamily: 'JetBrains Mono' }}>
          {hint}
        </div>
      )}
    </div>
  )
}

// Pill-style option button (like TopBar BPM arrows but as a selector)
function OptionBtn({
  active, onClick, children, title, comingSoon,
}: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string; comingSoon?: boolean }) {
  return (
    <button
      onClick={comingSoon ? undefined : onClick}
      title={title}
      style={{
        flex: 1,
        padding: '4px 0',
        borderRadius: 4,
        border: active ? '1px solid #e8a02755' : '1px solid #252535',
        background: active ? '#e8a02714' : '#131320',
        color: active ? '#e8a027' : '#505068',
        fontSize: 11,
        fontFamily: active ? 'JetBrains Mono' : 'Inter',
        fontWeight: active ? 700 : 400,
        cursor: comingSoon ? 'default' : 'pointer',
        opacity: comingSoon ? 0.4 : 1,
        transition: 'all 0.12s',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
      onMouseEnter={e => { if (!active && !comingSoon) e.currentTarget.style.color = '#9090a8' }}
      onMouseLeave={e => { if (!active && !comingSoon) e.currentTarget.style.color = '#505068' }}
    >
      {children}
    </button>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function SettingsPanel() {
  const settingsPanelOpen = useStore((s) => s.settingsPanelOpen)
  const setSettingsPanelOpen = useStore((s) => s.setSettingsPanelOpen)
  const noteNaming = useStore((s) => s.noteNaming)
  const setNoteNaming = useStore((s) => s.setNoteNaming)
  const accidentals = useStore((s) => s.accidentals)
  const setAccidentals = useStore((s) => s.setAccidentals)
  const keyboardSize = useStore((s) => s.keyboardSize)
  const setKeyboardSize = useStore((s) => s.setKeyboardSize)
  const zoomLevel = useStore((s) => s.zoomLevel)
  const setZoomLevel = useStore((s) => s.setZoomLevel)

  const NOTE_NAMING_OPTIONS: { value: NoteNaming; label: string; hint: string }[] = [
    { value: 'english',          label: 'English',  hint: 'C D E F G A B' },
    { value: 'central-european', label: 'C. Euro',  hint: 'C D E F G A H' },
    { value: 'solfege',          label: 'Solfège',  hint: 'Do Re Mi Fa Sol La Si' },
    { value: 'hidden',           label: 'Hidden',   hint: 'No labels shown' },
  ]

  const KEYBOARD_SIZES: KeyboardSize[] = [61, 73, 88]

  const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3]
  const zoomPct = Math.round(zoomLevel * 100)

  return (
    <div
      style={{
        width: settingsPanelOpen ? 220 : 32,
        background: '#13131a',
        borderRight: '1px solid #222230',
        transition: 'width 0.2s ease',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {/* Collapse toggle — mirrors TrackPanel's toggle on the right side */}
      <button
        onClick={() => setSettingsPanelOpen(!settingsPanelOpen)}
        title={settingsPanelOpen ? 'Close settings' : 'Open settings'}
        style={{
          position: 'absolute', top: 10, right: 0, zIndex: 10,
          padding: '4px 5px', borderRadius: '4px 0 0 4px',
          background: '#1a1a24', border: '1px solid #252535', borderRight: 'none',
          color: '#707088', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#e8a027' }}
        onMouseLeave={e => { e.currentTarget.style.color = '#707088' }}
      >
        {settingsPanelOpen
          ? <ChevronLeft size={13} />
          : <Settings2 size={13} />
        }
      </button>

      {settingsPanelOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

          {/* Header — mirrors TrackPanel header */}
          <div style={{
            height: 40, display: 'flex', alignItems: 'center',
            padding: '0 14px 0 14px',
            borderBottom: '1px solid #1e1e2c', flexShrink: 0,
            gap: 8,
          }}>
            <Settings2 size={14} style={{ color: '#50506a', flexShrink: 0 }} />
            <span style={{
              color: '#707088', fontSize: 11, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.1em',
            }}>
              Settings
            </span>
          </div>

          {/* Scrollable content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>

            {/* ── Note Naming ── */}
            <SectionHeader icon={<Type size={11} />} label="Note Names" />
            <OptionRow label="Display system">
              <div style={{ display: 'flex', gap: 4 }}>
                {NOTE_NAMING_OPTIONS.slice(0, 2).map(opt => (
                  <OptionBtn
                    key={opt.value}
                    active={noteNaming === opt.value}
                    onClick={() => setNoteNaming(opt.value)}
                    title={opt.hint}
                  >
                    {opt.label}
                  </OptionBtn>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                {NOTE_NAMING_OPTIONS.slice(2, 4).map(opt => (
                  <OptionBtn
                    key={opt.value}
                    active={noteNaming === opt.value}
                    onClick={() => setNoteNaming(opt.value)}
                    title={opt.hint}
                  >
                    {opt.label}
                  </OptionBtn>
                ))}
              </div>
              {/* Live preview */}
              <div style={{
                marginTop: 6, padding: '4px 8px',
                background: '#0e0e16', borderRadius: 4,
                fontSize: 10, fontFamily: 'JetBrains Mono',
                color: '#b0b0cc', letterSpacing: '0.08em',
                textAlign: 'center',
              }}>
                {noteNaming === 'english'          && (accidentals === 'sharp' ? 'C  D  E  F  G  A  B' : 'C  D  E  F  G  A  B')}
                {noteNaming === 'central-european' && (accidentals === 'sharp' ? 'C  D  E  F  G  A  H' : 'C  D  E  F  G  A  H')}
                {noteNaming === 'solfege'          && (accidentals === 'sharp' ? 'Do Re Mi Fa Sol La Si' : 'Do Re Mi Fa Sol La Si')}
                {noteNaming === 'hidden'           && '— labels hidden —'}
              </div>
            </OptionRow>

            {noteNaming !== 'hidden' && (
              <OptionRow
                label="Accidentals"
                hint={accidentals === 'flat'
                  ? 'e.g.  Bb  Eb  Ab  Db  Gb'
                  : 'e.g.  A#  D#  G#  C#  F#'}
              >
                <div style={{ display: 'flex', gap: 4 }}>
                  <OptionBtn
                    active={accidentals === 'flat'}
                    onClick={() => setAccidentals('flat')}
                    title="Use flat names (Bb, Eb, Ab…)"
                  >
                    ♭ Flats
                  </OptionBtn>
                  <OptionBtn
                    active={accidentals === 'sharp'}
                    onClick={() => setAccidentals('sharp')}
                    title="Use sharp names (A#, D#, G#…)"
                  >
                    ♯ Sharps
                  </OptionBtn>
                </div>
              </OptionRow>
            )}

            {/* ── Keyboard ── */}
            <SectionHeader icon={<Piano size={11} />} label="Keyboard" />
            <OptionRow label="Key range" hint="Number of keys visible on the virtual keyboard">
              <div style={{ display: 'flex', gap: 4 }}>
                {KEYBOARD_SIZES.map(size => (
                  <OptionBtn
                    key={size}
                    active={keyboardSize === size}
                    onClick={() => setKeyboardSize(size)}
                    title={`${size}-key keyboard`}
                  >
                    {size}
                  </OptionBtn>
                ))}
              </div>
            </OptionRow>

            {/* ── Piano Roll ── */}
            <SectionHeader icon={<ZoomIn size={11} />} label="Piano Roll" />
            <OptionRow
              label={`Zoom  —  ${zoomPct}%`}
              hint="How much vertical space each beat takes"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Minus */}
                <button
                  onClick={() => {
                    const idx = ZOOM_STEPS.indexOf(zoomLevel)
                    if (idx > 0) setZoomLevel(ZOOM_STEPS[idx - 1])
                  }}
                  disabled={zoomLevel <= ZOOM_STEPS[0]}
                  style={{
                    width: 22, height: 22, borderRadius: 4,
                    background: '#131320', border: '1px solid #252535',
                    color: zoomLevel <= ZOOM_STEPS[0] ? '#303040' : '#707088',
                    fontSize: 16, lineHeight: 1,
                    cursor: zoomLevel <= ZOOM_STEPS[0] ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >−</button>

                {/* Track */}
                <div style={{ flex: 1, position: 'relative', height: 4, background: '#1e1e2c', borderRadius: 2 }}>
                  <div style={{
                    position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 2,
                    background: '#e8a027',
                    width: `${((ZOOM_STEPS.indexOf(zoomLevel)) / (ZOOM_STEPS.length - 1)) * 100}%`,
                    transition: 'width 0.12s',
                  }} />
                  {ZOOM_STEPS.map((step, i) => (
                    <button
                      key={step}
                      onClick={() => setZoomLevel(step)}
                      title={`${Math.round(step * 100)}%`}
                      style={{
                        position: 'absolute',
                        left: `${(i / (ZOOM_STEPS.length - 1)) * 100}%`,
                        top: '50%', transform: 'translate(-50%, -50%)',
                        width: 10, height: 10, borderRadius: '50%',
                        background: zoomLevel === step ? '#e8a027' : '#2a2a3a',
                        border: `1.5px solid ${zoomLevel === step ? '#e8a027' : '#404055'}`,
                        cursor: 'pointer', padding: 0,
                        transition: 'all 0.12s',
                      }}
                    />
                  ))}
                </div>

                {/* Plus */}
                <button
                  onClick={() => {
                    const idx = ZOOM_STEPS.indexOf(zoomLevel)
                    if (idx < ZOOM_STEPS.length - 1) setZoomLevel(ZOOM_STEPS[idx + 1])
                  }}
                  disabled={zoomLevel >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
                  style={{
                    width: 22, height: 22, borderRadius: 4,
                    background: '#131320', border: '1px solid #252535',
                    color: zoomLevel >= ZOOM_STEPS[ZOOM_STEPS.length - 1] ? '#303040' : '#707088',
                    fontSize: 16, lineHeight: 1,
                    cursor: zoomLevel >= ZOOM_STEPS[ZOOM_STEPS.length - 1] ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >+</button>
              </div>
            </OptionRow>

            {/* ── Audio ── */}
            <SectionHeader icon={<Volume2 size={11} />} label="Audio" />
            <OptionRow
              label="Sound engine"
              hint="Samples require first-load download (~31MB). Your own .sf2 can be loaded later."
            >
              <div style={{ display: 'flex', gap: 4 }}>
                <OptionBtn
                  active={true}
                  onClick={() => {}}
                  title="Built-in GM synth — fast, no download"
                >
                  GM Synth
                </OptionBtn>
                <OptionBtn
                  active={false}
                  onClick={() => {}}
                  title="SF2 sample engine — coming in Stage 5c"
                  comingSoon
                >
                  Samples
                </OptionBtn>
              </div>
              <div style={{
                marginTop: 6, padding: '5px 8px',
                background: '#0e0e16', borderRadius: 4,
                fontSize: 9, color: '#50506a', fontFamily: 'JetBrains Mono',
                lineHeight: 1.5,
              }}>
                GM Synth active · GeneralUser GS bundled<br/>
                Custom .sf2 load — coming soon
              </div>
            </OptionRow>

            {/* ── Appearance ── */}
            <SectionHeader icon={<Palette size={11} />} label="Appearance" />
            <OptionRow label="Background" hint="Subtle warmth vs slightly lighter surface">
              <div style={{ display: 'flex', gap: 4 }}>
                <AppBgBtn
                  color="#0f0f12" label="Dark"
                  active={true /* always dark for now */}
                  onClick={() => {}}
                  title="#0f0f12 — default"
                />
                <AppBgBtn
                  color="#1a1a1a" label="Warm"
                  active={false}
                  onClick={() => {}}
                  title="#1a1a1a — slightly lighter (coming soon)"
                  comingSoon
                />
              </div>
            </OptionRow>

            {/* ── About / version ── */}
            <div style={{
              padding: '14px 14px 10px',
              borderTop: '1px solid #1a1a26',
              marginTop: 4,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                {/* Orfeo O mark — tiny */}
                <svg width="16" height="16" viewBox="0 0 100 100" fill="none">
                  <circle cx="50" cy="50" r="44" stroke="#e8a027" strokeWidth="8"/>
                  <line x1="22" y1="38" x2="78" y2="38" stroke="#e8a027" strokeWidth="7" strokeLinecap="round"/>
                  <line x1="22" y1="50" x2="78" y2="50" stroke="#e8a027" strokeWidth="7" strokeLinecap="round"/>
                  <line x1="22" y1="62" x2="78" y2="62" stroke="#e8a027" strokeWidth="7" strokeLinecap="round"/>
                </svg>
                <span style={{ color: '#50506a', fontSize: 10, fontFamily: 'JetBrains Mono' }}>
                  Orfeo · v0.3.0
                </span>
              </div>
              <div style={{ fontSize: 9, color: '#35354a', fontFamily: 'JetBrains Mono', lineHeight: 1.5 }}>
                MIT License · github.com/SquareBow/orfeo
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}

function AppBgBtn({
  color, label, active, onClick, title, comingSoon,
}: {
  color: string; label: string; active: boolean; onClick: () => void;
  title?: string; comingSoon?: boolean;
}) {
  return (
    <button
      onClick={comingSoon ? undefined : onClick}
      title={title}
      style={{
        flex: 1, padding: '6px 4px',
        borderRadius: 4,
        border: active ? '1px solid #e8a02755' : '1px solid #252535',
        background: active ? '#e8a02714' : '#131320',
        color: active ? '#e8a027' : '#505068',
        fontSize: 10,
        cursor: comingSoon ? 'default' : 'pointer',
        opacity: comingSoon ? 0.4 : 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        transition: 'all 0.12s',
      }}
    >
      {/* Color swatch */}
      <div style={{
        width: 28, height: 14, borderRadius: 3,
        background: color,
        border: '1px solid #303040',
      }} />
      <span style={{ fontFamily: 'Inter', fontSize: 10 }}>{label}</span>
    </button>
  )
}
