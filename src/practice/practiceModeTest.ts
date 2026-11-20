import { useStore, playerTrackFlags } from '../store'
import { useMidiSettings } from '../store/midiSettings'
import type { ParsedMidi, ParsedNote, TrackState } from '../types'
import { usePractice, practiceGate, enterPractice, leavePractice, setBand, setHearMine, speedPercent, setSpeedPercent } from './practiceMode'
import { isShown } from '../utils/trackShown'

const notes = (hand: 'L' | 'R', from: number): ParsedNote[] =>
  Array.from({ length: 8 }, (_, i) => ({ midi: from + i, time: i * 0.5, duration: 0.4, velocity: 0.7, trackIndex: 0, hand, handConfidence: 0.95 } as ParsedNote))
const track = (index: number, group: string, over: Partial<TrackState> = {}): TrackState => ({
  index, name: group, gmName: group, trackName: group, program: 0, group, isDrum: false, color: '#888', colorSource: 'default',
  muted: false, solo: false, visible: true, showOnKeyboard: true, volume: 100, pan: 64, chorus: 0, reverb: 0, ...over,
})

export function runPracticeModeTest(): number {
  console.group('[practiceMode] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // a song: one piano (both hands), a bass that the player had muted, strings hidden
  const midi = { fileName: 'Song.mid', duration: 10, tracks: [
    { index: 0, notes: [...notes('L', 40), ...notes('R', 70)] },
    { index: 1, notes: notes('L', 30) },
    { index: 2, notes: notes('R', 60) },
  ] } as unknown as ParsedMidi
  const tracks = [track(0, 'piano'), track(1, 'bass', { muted: true }), track(2, 'ensemble', { visible: false })]
  useStore.setState({ midi, tracks, practiceModeEnabled: false, noteEditorActive: false, focusActive: false, practiceActive: false,
    keyboardSize: 37 as any, keyboardOctave: 1, keyboardMode: 'floating', presentationMode: false, bpm: 120, originalBpm: 120, metronomeEnabled: true })
  useMidiSettings.setState({ devices: [] })

  // ── The gate ──
  check(practiceGate().ok === false && (practiceGate() as any).reason === 'off', 'off in Settings: closed')
  useStore.setState({ practiceModeEnabled: true })
  check((practiceGate() as any).reason === 'no-keyboard', 'no keyboard: closed')
  useMidiSettings.setState({ devices: [{ key: 'k', name: 'Keys', connected: true, portIds: ['p'] }] })
  check(practiceGate().ok, `ready song, keyboard in: open (${JSON.stringify(practiceGate())})`)
  useMidiSettings.setState({ devices: [{ key: 'v', name: 'loopMIDI', connected: true, portIds: ['p'], virtual: true }] })
  check(!practiceGate().ok, 'a software port is not a keyboard')
  useMidiSettings.setState({ devices: [{ key: 'k', name: 'Keys', connected: true, portIds: ['p'] }] })

  // ── In ──
  check(enterPractice() && usePractice.getState().active, 'enters')
  let s = useStore.getState()
  const [piano, bass, strings] = s.tracks
  check(!!piano.practicePart && piano.muted && isShown(piano, false), 'your part: silent but shown')
  check(bass.muted && !bass.visible && strings.muted && !strings.visible, 'the band: muted and hidden')
  check(s.keyboardSize === 88 && s.keyboardMode === 'docked', 'a 37-key keyboard becomes 88, docked')
  check(playerTrackFlags(bass).muted === true && playerTrackFlags(strings).visible === false && playerTrackFlags(piano).muted === false,
    'for saving, every track counts as the player left it')

  setBand(true)
  s = useStore.getState()
  check(!s.tracks[1].muted && !s.tracks[2].muted && s.tracks[0].muted, 'one click brings the band in; your part stays silent')
  check(!isShown(s.tracks[1], false), 'the band is heard, not shown')
  setHearMine(true)
  check(!useStore.getState().tracks[0].muted, 'hear my part too')

  // ── Ways of playing ──
  setSpeedPercent(60)
  check(speedPercent() === 60, 'Practise: any tempo')
  usePractice.setState({ way: 'wait' })
  check(speedPercent() === 100 && !useStore.getState().metronomeEnabled, "Wait for me: the song's own tempo, no metronome")
  usePractice.setState({ way: 'perform', level: 2 })
  setSpeedPercent(50)
  check(speedPercent() === 80, 'Performance level 2: at most 20 % slower')
  usePractice.setState({ way: 'practise', level: 1 })

  // ── Out ──
  leavePractice()
  s = useStore.getState()
  check(!usePractice.getState().active && !s.practiceActive, 'leaves')
  check(!s.tracks[0].muted && s.tracks[1].muted && !s.tracks[2].visible && s.tracks[0].practicePart === undefined, 'every track exactly as before')
  check(s.keyboardSize === (37 as any) && s.keyboardOctave === 1 && s.keyboardMode === 'floating', 'keyboard size, octave and floating back')
  check(s.bpm === 120 && s.metronomeEnabled === true, 'tempo and metronome back')

  // a song with three pianos can't be practised
  useStore.setState({ tracks: [track(0, 'piano'), track(1, 'piano'), track(2, 'piano')] })
  check((practiceGate() as any).reason === 'too-many', 'three pianos: closed')

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
