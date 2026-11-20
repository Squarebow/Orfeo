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

  // a song: the piano split into its two hands, a bass the player had muted, strings hidden
  const midi = { fileName: 'Song.mid', duration: 10, tracks: [
    { index: 0, name: 'Piano LH', notes: notes('L', 40) },
    { index: 1, notes: notes('L', 30) },
    { index: 2, notes: notes('R', 60) },
    { index: 3, name: 'Piano RH', notes: notes('R', 70) },
  ] } as unknown as ParsedMidi
  const tracks = [track(0, 'piano', { trackName: 'Piano LH' }), track(1, 'bass', { muted: true }), track(2, 'ensemble', { visible: false }), track(3, 'piano', { trackName: 'Piano RH' })]
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
  usePractice.setState({ way: 'practise', hand: 'R', hearMine: false })
  check(enterPractice() && usePractice.getState().active, 'enters')
  let s = useStore.getState()
  const [left, bass, strings, right] = s.tracks
  check(left.practiceHand === 'L' && right.practiceHand === 'R', 'each hand track knows its hand')
  check(right.muted && isShown(right, false), 'right hand practised: silent but shown')
  check(!left.muted && isShown(left, false), 'the left hand plays along, shown')
  const piano = right
  check(bass.muted && !bass.visible && strings.muted && !strings.visible, 'the band: muted and hidden')
  check(s.keyboardSize === 88 && s.keyboardMode === 'docked', 'a 37-key keyboard becomes 88, docked')
  check(playerTrackFlags(bass).muted === true && playerTrackFlags(strings).visible === false && playerTrackFlags(piano).muted === false,
    'for saving, every track counts as the player left it')

  setBand(true)
  s = useStore.getState()
  check(!s.tracks[1].muted && !s.tracks[2].muted && s.tracks[3].muted, 'one click brings the band in; your hand stays silent')
  check(!isShown(s.tracks[1], false), 'the band is heard, not shown')
  setHearMine(true)
  check(!useStore.getState().tracks[3].muted, 'hear my part too')
  setHearMine(false)
  usePractice.setState({ hand: 'L' })
  s = useStore.getState()
  check(s.tracks[0].muted && !s.tracks[3].muted, 'left hand practised: the right plays along')
  usePractice.setState({ hand: 'B' })
  s = useStore.getState()
  check(s.tracks[0].muted && s.tracks[3].muted, 'both hands: both silent')
  usePractice.setState({ hand: 'R', way: 'wait' })
  s = useStore.getState()
  check(s.tracks[0].muted && s.tracks[3].muted, 'Wait for me is always both hands')
  usePractice.setState({ way: 'practise' })

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
  check(!s.tracks[0].muted && s.tracks[1].muted && !s.tracks[2].visible && !s.tracks[3].muted && s.tracks[0].practicePart === undefined && s.tracks[3].practiceHand === undefined, 'every track exactly as before')
  check(s.keyboardSize === (37 as any) && s.keyboardOctave === 1 && s.keyboardMode === 'floating', 'keyboard size, octave and floating back')
  check(s.bpm === 120 && s.metronomeEnabled === true, 'tempo and metronome back')

  // a song with three pianos can't be practised; one mixed piano track needs preparing first
  useStore.setState({ tracks: [track(0, 'piano'), track(1, 'piano'), track(2, 'piano'), track(3, 'bass')] })
  check((practiceGate() as any).reason === 'too-many', 'three pianos: closed')
  useStore.setState({ midi: { fileName: 'One.mid', duration: 10, tracks: [{ index: 0, notes: [...notes('L', 40), ...notes('R', 70)] }] } as unknown as ParsedMidi, tracks: [track(0, 'piano')] })
  check((practiceGate() as any).reason === 'prepare', 'one piano track with both hands: Prepare for practice first')
  // a piano part that is one hand throughout: practised with that hand, always
  useStore.setState({ midi: { fileName: 'Tune.mid', duration: 10, tracks: [{ index: 0, notes: notes('R', 70) }] } as unknown as ParsedMidi, tracks: [track(0, 'piano')] })
  check(practiceGate().ok && (practiceGate() as any).onlyHand === 'R', 'a right-hand tune: ready, right hand only')
  usePractice.setState({ way: 'practise', hand: 'L' })
  check(enterPractice() && usePractice.getState().onlyHand === 'R', 'enters with the right hand only')
  check(useStore.getState().tracks[0].muted && useStore.getState().tracks[0].practiceHand === 'R', 'the tune is yours: silent, shown')
  leavePractice()
  check(usePractice.getState().onlyHand === null && !useStore.getState().tracks[0].muted, 'leaving puts it back')

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
