import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { KeyboardMusic, Zap, Timer, Speaker, Feather, Copy, Footprints, Stethoscope, Wrench, RefreshCw, FileDown, Plug } from 'lucide-react'
import { useStore } from '../../../store'
import { t } from '../../../utils/i18n'
import { OptionBtn, Switch, SettingsDropdown, HelpText, GlanceLine, ZoomStepBtn } from '../controls'
import { MarqueeText } from '../../MarqueeText'
import { useMidiSettings, MIDI_DEFAULTS, type ControlKind, type LiveResponse, type VelocityCurve } from '../../../store/midiSettings'
import { rescanMidiDevices, clearStuckNotes, resetMidiInput } from '../../../hooks/useMidiInput'
import { reopenGmOutput } from '../../../hooks/useAudioEngine'
import { getStartedStable } from '../../../hooks/useSamplesEngine'
import { getDelayBreakdown, getStats, counters, exportPerformanceLog, clearDiagnostics } from '../../../utils/midiDiagnostics'
import { sim, simAvailable } from '../../../utils/midiSimulator'
import { confirmDialog } from '../../../utils/confirmController'
import { useNativeAudio } from '../../../audio/nativeClient'
import type { SettingDef } from '../types'

const set = (p: Parameters<ReturnType<typeof useMidiSettings.getState>['set']>[0]) => useMidiSettings.getState().set(p)
const ms = (v: number | null, digits = 0) => (v === null ? '—' : `${v.toFixed(digits)} ms`)

// ── Small building blocks ────────────────────────────────────────────────────
function Row({ children, dim }: { children: ReactNode; dim?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', columnGap: 8, minHeight: 22,
      fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', color: 'var(--text-default)', opacity: dim ? 0.45 : 1, transition: 'opacity 0.15s' }}>
      {children}
    </div>
  )
}

function SwitchRow({ label, value, onChange, dim, note }: { label: string; value: boolean; onChange: (v: boolean) => void; dim?: boolean; note?: ReactNode }) {
  return (
    <Row dim={dim}>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}{note && <> {note}</>}</span>
      <Switch value={value} onChange={onChange} label={label} />
    </Row>
  )
}

function ActionBtn({ onClick, children, icon }: { onClick: () => void; children: ReactNode; icon?: ReactNode }) {
  return (
    <button onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '5px 8px', width: '100%',
        borderRadius: 4, border: '1px solid var(--border2)', background: 'var(--bg-modal)', color: 'var(--text-inactive)',
        fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', cursor: 'pointer' }}
      onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-amber)'; e.currentTarget.style.borderColor = 'var(--text-amber)' }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-inactive)'; e.currentTarget.style.borderColor = 'var(--border2)' }}>
      {icon}{children}
    </button>
  )
}

function Stepper({ value, min, max, step, format, onChange, label }: {
  value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void; label: string
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v))
  return (
    <Row>
      <span>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <ZoomStepBtn onClick={() => onChange(clamp(value - step))} disabled={value <= min}>−</ZoomStepBtn>
        <span style={{ minWidth: 52, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-amber)' }}>{format(value)}</span>
        <ZoomStepBtn onClick={() => onChange(clamp(value + step))} disabled={value >= max}>+</ZoomStepBtn>
      </div>
    </Row>
  )
}

// Flashes each time the keyboard sends something
function ActivityLight({ at, connected }: { at?: number; connected: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!at || !ref.current) return
    ref.current.animate([{ background: 'var(--text-amber)', boxShadow: '0 0 6px var(--text-amber)' }, { background: 'var(--status-success, #4caf50)', boxShadow: 'none' }], { duration: 350, easing: 'ease-out' })
  }, [at])
  return <span ref={ref} style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: connected ? 'var(--status-success, #4caf50)' : 'var(--state-disabled)' }} />
}

// Re-render on new timing samples (throttled in midiDiagnostics)
const useDiag = () => useMidiSettings(s => s.diagVersion)

// ── Keyboards ────────────────────────────────────────────────────────────────
function KeyboardsControl() {
  const devices = useMidiSettings(s => s.devices)
  const activity = useMidiSettings(s => s.activity)
  const listenMode = useMidiSettings(s => s.listenMode)
  const selected = useMidiSettings(s => s.selectedDevices)
  const active = useMidiSettings(s => s.activeDevice)
  const error = useMidiSettings(s => s.accessError)
  const toggle = (key: string) => set({ selectedDevices: selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key] })
  return (
    <>
      <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
        <OptionBtn active={listenMode === 'all'} onClick={() => set({ listenMode: 'all' })}>{t`Listen to all`}</OptionBtn>
        <OptionBtn active={listenMode === 'selected'} onClick={() => set({ listenMode: 'selected' })}>{t`Select`}</OptionBtn>
      </div>
      <div style={{ marginTop: 8, display: 'grid', gap: 2 }}>
        {error && <HelpText>{t`MIDI isn't available: ${error}`}</HelpText>}
        {!error && devices.length === 0 && <HelpText>{t`Plug one in by USB — it appears here straight away.`}</HelpText>}
        {devices.map(d => {
          const listening = listenMode === 'all' || selected.includes(d.key)
          return (
            <div key={d.key} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', alignItems: 'center', columnGap: 8, minHeight: 30,
              fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)' }}>
              <ActivityLight at={activity[d.key]} connected={d.connected} />
              <span style={{ minWidth: 0, display: 'grid' }}>
                <span style={{ display: 'flex', minWidth: 0 }}>
                  <MarqueeText name={d.name} spanStyle={{ color: d.connected ? (d.key === active ? 'var(--text-amber)' : 'var(--text-default)') : 'var(--text-muted)', fontWeight: d.key === active ? 600 : 400 }} />
                </span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.3 }}>
                  {!d.connected ? t`unplugged` : d.key === active ? t`playing` : listening ? t`ready` : t`not listened to`}
                </span>
              </span>
              {listenMode === 'selected'
                ? <input type="checkbox" checked={selected.includes(d.key)} onChange={() => toggle(d.key)} aria-label={t`Listen to ${d.name}`} style={{ accentColor: 'var(--text-amber)', cursor: 'pointer' }} />
                : <span />}
            </div>
          )
        })}
      </div>
    </>
  )
}

function KeyboardsExtra() {
  return simAvailable ? <SimulatorPanel /> : null
}

// ── Reconnect automatically ──────────────────────────────────────────────────
function ReconnectControl() {
  const v = useMidiSettings(s => s.autoReconnect)
  return <Switch value={v} onChange={x => set({ autoReconnect: x })} label={t`Reconnect automatically`} />
}
function ReconnectExtra() {
  return <div style={{ marginTop: 10 }}><ActionBtn onClick={() => void rescanMidiDevices()} icon={<RefreshCw size={11} strokeWidth={1.5} />}>{t`Rescan keyboards`}</ActionBtn></div>
}

// ── Development builds only: pretend keyboards are plugged in ────────────────
function SimulatorPanel() {
  useMidiSettings(s => s.devices)  // re-render on plug / unplug
  const [target, setTarget] = useState(sim.models[0].key)
  const plugged = sim.isPlugged(target)
  const btn = (label: string, fn: () => void) => (
    <button key={label} onClick={fn} disabled={!plugged && label !== t`Plug in`}
      style={{ padding: '3px 6px', borderRadius: 4, border: '1px dashed var(--border2)', background: 'transparent', color: 'var(--text-inactive)',
        fontSize: 10, fontFamily: 'var(--font-ui)', cursor: 'pointer', opacity: !plugged && label !== t`Plug in` ? 0.4 : 1 }}>{label}</button>
  )
  return (
    <div style={{ marginTop: 12, padding: 8, border: '1px dashed var(--border2)', borderRadius: 4 }}>
      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>{t`Simulated keyboard · test builds only`}</div>
      <div style={{ display: 'flex', gap: 'var(--space-1)', marginBottom: 6 }}>
        {sim.models.map(m => (
          <OptionBtn key={m.key} active={target === m.key} onClick={() => setTarget(m.key)}>
            {m.key === 's88' ? 'S88 MK3' : m.key === 'mpk' ? 'MPK mini' : 'Launchkey'}
          </OptionBtn>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {plugged ? btn(t`Unplug`, () => sim.unplug(target)) : btn(t`Plug in`, () => sim.plug(target))}
        {btn(t`C major chord`, () => sim.chord(target, [48, 60, 64, 67]))}
        {btn(t`Run`, () => sim.run(target))}
        {btn(t`Pedal down`, () => sim.pedal(target, true))}
        {btn(t`Pedal up`, () => sim.pedal(target, false))}
        {btn(t`Pitch bend`, () => sim.wiggle(target))}
        {btn(t`Mod wheel`, () => { sim.modWheel(target, 90); setTimeout(() => sim.modWheel(target, 0), 600) })}
        {btn(t`Aftertouch`, () => { sim.aftertouch(target, 100); setTimeout(() => sim.aftertouch(target, 0), 600) })}
        {btn(t`Double key`, () => sim.doubleTrigger(target))}
        {btn(t`Unplug mid-note`, () => sim.stuckNote(target))}
      </div>
    </div>
  )
}

// ── Live playing response ────────────────────────────────────────────────────
const RESPONSES: { v: LiveResponse; label: string; hint: string }[] = [
  { v: 'low', label: t`Low latency`, hint: t`Ideal for playing along — the quickest response` },
  { v: 'balanced', label: t`Balanced`, hint: t`A middle way — your playing blends into the song's sound` },
  { v: 'stable', label: t`Stable`, hint: t`For older computers whose sound crackles` },
]

function LiveResponseControl() {
  const v = useMidiSettings(s => s.liveResponse)
  const engine = useStore(s => s.audioEngine)
  const started = getStartedStable()  // null until the Studio engine has started
  const nativeExclusive = useMidiSettings(s => s.nativeExclusive)
  const autoLow = useMidiSettings(s => s.autoLowLatency)
  const heading = (s: string) => <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-amber)', marginBottom: 6 }}>{s}</div>
  return (
    <div style={{ display: 'grid', rowGap: 14 }}>
      <div style={{ minWidth: 0 }}>
        {heading(engine === 'gm' ? t`With GM` : engine === 'native' ? t`With Native` : t`With Studio`)}
        {engine === 'gm' && <HelpText>{t`GM plays your keys at once: there's nothing between your keys and the synth.`}</HelpText>}
        {engine === 'native' && <HelpText>{nativeExclusive
          ? t`Native is in Exclusive mode: your keys go straight to the sound card, the shortest delay this computer can do.`
          : t`Native is sharing the sound card with other apps, which adds Windows' usual delay. For the shortest delay choose Exclusive under Settings › Audio › Sound engine.`}</HelpText>}
        {engine === 'samples' && (
          <>
            <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
              {RESPONSES.map(r => <OptionBtn key={r.v} active={v === r.v} title={r.hint} oneLine onClick={() => set({ liveResponse: r.v })}>{r.label}</OptionBtn>)}
            </div>
            <HelpText>{v === 'low'
              ? t`Your keys skip the song's compressor and limiter, and are heard about 12 ms sooner.`
              : v === 'balanced'
                ? t`Your keys go through the song's compressor with it, so they sit in the same mix — about 12 ms later.`
                : t`A larger sound buffer for computers whose sound crackles — about 10 ms later.`}</HelpText>
            {started !== null && (v === 'stable') !== started && <HelpText>{t`The sound buffer size changes the next time Orfeo starts.`}</HelpText>}
          </>
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        {heading(t`When a keyboard is plugged in`)}
        <SwitchRow label={t`Auto-switch to Exclusive`} value={autoLow} onChange={x => set({ autoLowLatency: x })} />
        <HelpText>{t`Recommended when you play along on a keyboard and nothing else on the computer needs sound: plugging a keyboard in switches Native to Exclusive, for the shortest delay; unplugging the last one switches back to Shared. Off: Native stays in the mode you choose.`}</HelpText>
      </div>
    </div>
  )
}

// "Keyboard → speaker on this computer: about 44 ms" — at the right of the tab row
function KeyToEarGlance() {
  useDiag()
  useMidiSettings(s => s.liveResponse)
  const [, tick] = useState(0)
  useEffect(() => { const id = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(id) }, [])
  const b = getDelayBreakdown()
  const st = getStats()
  const style = { fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-inactive)' } as const
  if (b.outputMs === null) return <span style={style}>{t`Keyboard → speaker: can't be measured for this sound output`}</span>
  const total = (st.avgInputMs ?? 0) + (st.avgHandleMs ?? 0) + b.synthBlockMs + b.chainMs + b.outputMs
  return <span style={style}>{t`Keyboard → speaker on this computer: about`} <span style={{ color: 'var(--text-amber)' }}>{Math.round(total)} ms</span></span>
}

// "No keyboards connected" — at the right of the Keyboards tab row, only while none is
function NoKeyboardsAside() {
  const devices = useMidiSettings(s => s.devices)
  const error = useMidiSettings(s => s.accessError)
  if (error || devices.some(d => d.connected)) return null
  return <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', color: 'var(--text-amber)' }}>{t`No keyboards connected`}</span>
}

export const TAB_ASIDES: Record<string, ComponentType> = { noKeyboards: NoKeyboardsAside, keyToSpeaker: KeyToEarGlance }

// ── Audio delay offset ───────────────────────────────────────────────────────
function LatencyOffsetControl() {
  const v = useMidiSettings(s => s.latencyOffsetMs)
  return (
    <>
      <Stepper label={t`Shift by`} value={v} min={-100} max={100} step={10}
        format={x => (x > 0 ? `+${x} ms` : `${x} ms`)} onChange={x => set({ latencyOffsetMs: x })} />
      {v !== 0 && <div style={{ marginTop: 4 }}><ActionBtn onClick={() => set({ latencyOffsetMs: 0 })}>{t`Back to measured only`}</ActionBtn></div>}
    </>
  )
}
function LatencyOffsetGlance() {
  useMidiSettings(s => s.latencyOffsetMs)
  useStore(s => s.audioEngine)
  const [, tick] = useState(0)
  useEffect(() => { const id = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(id) }, [])
  const b = getDelayBreakdown()
  const off = useMidiSettings.getState().latencyOffsetMs
  const measured = b.outputMs === null ? null : Math.round(b.outputMs)
  return (
    <GlanceLine>
      {t`Measured`} {measured === null ? t`— not measurable` : `${measured} ms`} · {t`used`} <span style={{ color: 'var(--text-amber)' }}>{Math.max(0, (measured ?? 0) + off)} ms</span>
    </GlanceLine>
  )
}

// ── General MIDI sound ───────────────────────────────────────────────────────
function GmOutputControl() {
  const gmOutput = useMidiSettings(s => s.gmOutput)
  const outputs = useMidiSettings(s => s.outputs)
  const missing = gmOutput && !outputs.some(o => o.port === gmOutput)
  const options = [
    { value: '', label: t`Orfeo's built-in synth` },
    ...outputs.map(o => ({ value: o.port, label: o.name })),
    ...(missing ? [{ value: gmOutput, label: t`${gmOutput} (not connected)` }] : []),
  ]
  return (
    <>
      <SettingsDropdown value={gmOutput} options={options} onChange={(v) => { set({ gmOutput: v }); void reopenGmOutput() }} />
      {missing && <HelpText>{t`That instrument isn't connected — General MIDI uses Orfeo's own synth until it's back.`}</HelpText>}
      {!!gmOutput && !missing && <HelpText>{t`Pick only an instrument with its own sounds — a keyboard without speakers would play nothing.`}</HelpText>}
    </>
  )
}

// ── Touch response ───────────────────────────────────────────────────────────
const CURVES: { v: VelocityCurve; label: string }[] = [
  { v: 'soft', label: t`Soft` }, { v: 'normal', label: t`Normal` }, { v: 'hard', label: t`Hard` }, { v: 'fixed', label: t`Fixed` },
]
function TouchControl() {
  const v = useMidiSettings(s => s.velocityCurve)
  return (
    <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
      {CURVES.map(c => <OptionBtn key={c.v} active={v === c.v} onClick={() => set({ velocityCurve: c.v })}>{c.label}</OptionBtn>)}
    </div>
  )
}
function TouchExtra() {
  const curve = useMidiSettings(s => s.velocityCurve)
  const fixed = useMidiSettings(s => s.fixedVelocity)
  const min = useMidiSettings(s => s.minVelocity)
  const max = useMidiSettings(s => s.maxVelocity)
  const pct = (x: number) => `${Math.round(x / 127 * 100)}%`
  useDiag()
  return (
    <div style={{ marginTop: 8, display: 'grid', gap: 2 }}>
      {curve === 'fixed' && <Stepper label={t`Every note at`} value={fixed} min={10} max={127} step={10} format={pct} onChange={x => set({ fixedVelocity: x })} />}
      <Stepper label={t`Ignore touches lighter than`} value={min} min={1} max={61} step={5} format={x => (x <= 1 ? t`none` : pct(x))} onChange={x => set({ minVelocity: x })} />
      <Stepper label={t`Loudest note`} value={max} min={37} max={127} step={10} format={pct} onChange={x => set({ maxVelocity: x })} />
      {counters.softIgnored > 0 && <GlanceLine>{t`Light touches ignored this session:`} {counters.softIgnored}</GlanceLine>}
    </div>
  )
}

// ── Double-note filter ───────────────────────────────────────────────────────
function DuplicateControl() {
  const v = useMidiSettings(s => s.duplicateFilterMs)
  return (
    <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
      {[0, 10, 20, 40].map(x => <OptionBtn key={x} active={v === x} onClick={() => set({ duplicateFilterMs: x })}>{x === 0 ? t`Off` : `${x} ms`}</OptionBtn>)}
    </div>
  )
}
function DuplicateGlance() {
  useDiag()
  const on = useMidiSettings(s => s.duplicateFilterMs) > 0
  if (!on) return null
  return <GlanceLine>{t`Repeats caught this session:`} {counters.duplicatesDropped}</GlanceLine>
}

// ── Pedals & controls ────────────────────────────────────────────────────────
const CONTROL_LABELS: { k: ControlKind; label: string }[] = [
  { k: 'sustain', label: t`Sustain pedal` },
  { k: 'sostenuto', label: t`Sostenuto pedal` },
  { k: 'soft', label: t`Soft pedal` },
  { k: 'pitchBend', label: t`Pitch bend` },
  { k: 'modWheel', label: t`Modulation wheel` },
  { k: 'channelPressure', label: t`Aftertouch (keyboard)` },
  { k: 'polyPressure', label: t`Aftertouch (per key)` },
  { k: 'expression', label: t`Expression pedal` },
  { k: 'volume', label: t`Volume slider` },
]
function PedalsControl() {
  const controls = useMidiSettings(s => s.controls)
  const detected = useMidiSettings(s => s.detected)
  const sustainDown = useMidiSettings(s => s.sustainDown)
  return (
    <div style={{ display: 'grid', gap: 1 }}>
      {CONTROL_LABELS.map(({ k, label }) => (
        <SwitchRow key={k} label={label} value={controls[k]} dim={!detected[k]}
          onChange={v => set({ controls: { ...controls, [k]: v } })}
          note={
            <span style={{ fontSize: 9, color: k === 'sustain' && sustainDown ? 'var(--text-amber)' : 'var(--text-muted)' }}>
              {k === 'sustain' && sustainDown ? t`· down` : detected[k] ? t`· detected` : t`· not detected`}
            </span>
          } />
      ))}
    </div>
  )
}
function PedalsExtra() {
  return <HelpText>{t`The volume slider is off at first: many keyboards send it from a fader meant for recording software, which would quietly turn Orfeo down.`}</HelpText>
}

// ── Delay check ──────────────────────────────────────────────────────────────
function DelayCheckControl() {
  useDiag()
  useMidiSettings(s => s.liveResponse)
  const engine = useStore(s => s.audioEngine)
  const [, tick] = useState(0)
  useEffect(() => { const id = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(id) }, [])
  const b = getDelayBreakdown()
  const st = getStats()
  const nativeMode = useNativeAudio(s => s.status?.mode)
  const shared = engine === 'native' && nativeMode === 'shared'
  const line = (label: string, value: string, strong?: boolean) => (
    <Row key={label}>
      <span style={{ color: strong ? 'var(--text-default)' : 'var(--text-inactive)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: strong ? 'var(--text-amber)' : 'var(--text-muted)' }}>{value}</span>
    </Row>
  )
  const total = b.outputMs === null ? null
    : (st.avgInputMs ?? 0) + (st.avgHandleMs ?? 0) + b.synthBlockMs + b.chainMs + b.outputMs
  return (
    <div style={{ display: 'grid', gap: 1 }}>
      {line(t`Notes measured`, st.notes ? String(st.notes) : t`none yet`)}
      {line(t`Key reaching Orfeo`, st.avgInputMs === null ? '—' : `${ms(st.avgInputMs, 1)} (${t`worst`} ${ms(st.worstInputMs, 1)})`)}
      {line(t`Orfeo handling the key`, st.avgHandleMs === null ? '—' : `${ms(st.avgHandleMs, 1)} (${t`worst`} ${ms(st.worstHandleMs, 1)})`)}
      {line(t`Synth getting its turn`, b.externalOutput ? t`external` : `≤ ${ms(b.synthBlockMs, 1)}`)}
      {line(engine === 'samples' ? t`Compressor & limiter` : t`Sound processing`, ms(b.chainMs))}
      {line(shared ? t`Sound output (shared with other apps)` : t`Sound output (Windows + sound card)`, b.outputMs === null ? t`not measurable` : ms(b.outputMs))}
      {line(t`Key → speaker, about`, total === null ? '—' : ms(total), true)}
    </div>
  )
}
function DelayCheckExtra() {
  return (
    <>
      <HelpText>{t`The sound output part is set by Windows and your sound card: wired headphones or a USB audio interface lower it, Bluetooth raises it a lot.`}</HelpText>
      <HelpText>{t`Start over forgets the notes measured so far; the fixed parts of the trip don't change.`}</HelpText>
      <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 6 }}>
        <ActionBtn onClick={exportPerformanceLog} icon={<FileDown size={11} strokeWidth={1.5} />}>{t`Save log…`}</ActionBtn>
        <ActionBtn onClick={clearDiagnostics}>{t`Start over`}</ActionBtn>
      </div>
    </>
  )
}

// ── Reset & repair ───────────────────────────────────────────────────────────
function ToolsControl() {
  const resetSettings = async () => {
    const choice = await confirmDialog({
      title: t`Reset MIDI keyboard settings?`,
      message: t`Everything on this page goes back to how it started. Your keyboards stay connected.`,
      buttons: [t`Reset`, t`Cancel`], destructiveIndex: 0,
    })
    if (choice !== 0) return
    const hadGmOutput = useMidiSettings.getState().gmOutput !== MIDI_DEFAULTS.gmOutput
    useMidiSettings.getState().resetPrefs()
    if (hadGmOutput) void reopenGmOutput()
  }
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <ActionBtn onClick={clearStuckNotes}>{t`Clear stuck notes`}</ActionBtn>
      <ActionBtn onClick={() => void resetMidiInput()}>{t`Reset MIDI input`}</ActionBtn>
      <ActionBtn onClick={() => void resetSettings()}>{t`Reset settings`}</ActionBtn>
    </div>
  )
}

export const MIDI_DEFS: SettingDef[] = [
  { id: 'midiKeyboards', icon: KeyboardMusic, kind: 'choice', Control: KeyboardsControl, Extra: KeyboardsExtra },
  { id: 'midiReconnect', icon: Plug, kind: 'switch', Control: ReconnectControl, Extra: ReconnectExtra },
  { id: 'liveResponse', icon: Zap, kind: 'choice', Control: LiveResponseControl, notice: true },
  { id: 'latencyOffset', icon: Timer, kind: 'choice', Control: LatencyOffsetControl, Glance: LatencyOffsetGlance },
  { id: 'gmOutput', icon: Speaker, kind: 'choice', Control: GmOutputControl },
  { id: 'touchResponse', icon: Feather, kind: 'choice', Control: TouchControl, Extra: TouchExtra },
  { id: 'duplicateFilter', icon: Copy, kind: 'choice', Control: DuplicateControl, Glance: DuplicateGlance },
  { id: 'pedalsControls', icon: Footprints, kind: 'choice', Control: PedalsControl, Extra: PedalsExtra },
  { id: 'delayCheck', icon: Stethoscope, kind: 'choice', Control: DelayCheckControl, Extra: DelayCheckExtra },
  { id: 'midiTools', icon: Wrench, kind: 'choice', Control: ToolsControl },
]

