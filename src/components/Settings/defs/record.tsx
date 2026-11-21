import { useState } from 'react'
import { OptionBtn } from '../controls'
import { useStore } from '../../../store'
import { useRecorder, startRecording, stopRecording } from '../../../record/recorder'
import { recordingToMidi } from '../../../record/recordingToMidi'
import { runExport, takeBaseName, EXPORT_FORMATS } from '../../../export/exporters'

// ── Dev Tools: recording and exports (after 2.0), plain strings ──────────────
const devBox: React.CSSProperties = { marginTop: 12, padding: 8, border: '1px dashed var(--border2)', borderRadius: 4, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', display: 'grid', rowGap: 6 }
const devHead: React.CSSProperties = { fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const noteName = (n: number) => `${NOTE[n % 12]}${Math.floor(n / 12) - 1}`

export function RecordingTestPanel() {
  const { recording, notes, last } = useRecorder()
  const [split, setSplit] = useState<number | null>(null)
  const [trim, setTrim] = useState(true)
  const [saved, setSaved] = useState('')
  const song = useStore(s => s.midi?.fileName ?? null)

  const save = async () => {
    if (!last) return
    const lib = (useStore.getState() as any).libraryFolder as string | null ?? null
    const path = await runExport({
      format: 'take-midi', baseName: takeBaseName(song, last.startedAt),
      build: () => recordingToMidi(last, { splitKey: split ?? undefined, trimStart: trim, name: takeBaseName(song, last.startedAt) }),
    }, lib)
    setSaved(path ? `Saved: ${path}` : 'Cancelled')
  }

  return (
    <div style={devBox}>
      <div style={devHead}>Recording · test</div>
      <div>Records every key and pedal from your keyboard (or the simulated one) as you play, then saves it as an ordinary MIDI file. Groundwork only: players get Blank and Overdub later. Nothing is saved unless you press Save.</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        <OptionBtn active={recording} onClick={() => { if (recording) stopRecording(); else { setSaved(''); void startRecording({ bpm: useStore.getState().bpm || 120 }) } }}>
          {recording ? '■ Stop' : '● Record'}
        </OptionBtn>
        <span>{recording ? `Recording… ${notes} notes` : last ? `Last take: ${last.events.filter(e => e.type === 'on').length} notes, ${last.duration.toFixed(1)} s, ${Math.round(last.bpm)} BPM` : 'No take yet'}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        <span>Tracks:</span>
        <OptionBtn active={split === null} onClick={() => setSplit(null)}>One piano</OptionBtn>
        {[55, 60].map(k => <OptionBtn key={k} active={split === k} onClick={() => setSplit(k)}>{`Two hands, split at ${noteName(k)}`}</OptionBtn>)}
        <OptionBtn active={trim} onClick={() => setTrim(!trim)}>Start at the first note</OptionBtn>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        <OptionBtn active={false} onClick={() => void save()}>{last ? 'Save as MIDI…' : 'Save as MIDI… (record first)'}</OptionBtn>
        {saved && <span style={{ wordBreak: 'break-all' }}>{saved}</span>}
      </div>
      <div>Export formats: {Object.values(EXPORT_FORMATS).map(f => `${f.name}${f.ready ? '' : ' (planned)'}`).join(' · ')}</div>
    </div>
  )
}
