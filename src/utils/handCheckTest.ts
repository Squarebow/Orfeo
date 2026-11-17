import { useStore } from '../store'
import { goToPassage, markPassageCorrect, fixPassageByHand, passagesOf, endHandCheck } from './handCheck'
import type { ParsedMidi, ParsedNote } from '../types'
import { NES, buildNoteEditSummary } from './noteEditorState'

const note = (time: number, handConfidence: number): ParsedNote =>
  ({ midi: 60, time, duration: 0.3, velocity: 0.7, trackIndex: 0, hand: 'R', handConfidence } as ParsedNote)

export function runHandCheckTest(): number {
  console.group('[handCheck] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // a piano with three unsure passages, at 2 s, 10 s and 20 s
  const notes = [note(0, 0.9), note(2, 0.2), note(2.4, 0.3), note(6, 0.95), note(10, 0.1), note(20, 0.4), note(25, 0.9)]
  const midi = { fileName: 'Song.mid', duration: 30, tracks: [{ index: 0, notes }], _filePath: 'C:/Songs/Song.mid' } as unknown as ParsedMidi
  useStore.setState({ midi, loopStart: 40, loopEnd: 44, loopRegionActive: false, playbackState: 'stopped', handCheck: null })
  check(passagesOf(0).length === 3, `three passages worth a look, got ${passagesOf(0).length}`)

  goToPassage(0, 0)
  let s = useStore.getState()
  check(s.handCheck?.index === 0 && s.handCheck.panel, 'the first passage, with its choices')
  check(s.loopRegionActive && s.loopStart! < 2 && s.loopEnd! > 2.7 && s.currentTime === s.loopStart, 'it loops, the playhead at its start')

  goToPassage(0, 1)
  check(useStore.getState().loopStart! < 10 && useStore.getState().loopEnd! > 10.3, 'the next passage becomes the loop')

  fixPassageByHand()
  s = useStore.getState()
  check(s.handCheck?.panel === false && s.loopRegionActive, 'Fix by hand: choices hidden, the passage still looped')

  markPassageCorrect()
  s = useStore.getState()
  check(notes[4].handConfidence === 1, 'The hands are right: its notes count as sure')
  check(passagesOf(0).length === 2 && s.handCheck?.index === 1 && s.loopStart! < 20 && s.loopEnd! > 20.3, 'on to the next passage (the one at 20 s)')

  useStore.setState({ noteEditorActive: true })
  useStore.setState({ noteEditorActive: false })
  s = useStore.getState()
  check(s.handCheck === null && s.loopStart === 40 && s.loopEnd === 44 && !s.loopRegionActive, 'closing the Note Editor ends the check and puts your own loop back')

  // "The hands are right" is an edit: undoable, counted, saved with the song
  const notes2 = [note(0, 0.9), note(3, 0.2), note(3.3, 0.25), note(8, 0.9)]
  const edit = notes2.map(n => ({ ...n }))
  useStore.setState({ midi: { fileName: 'Song.mid', duration: 10, tracks: [{ index: 0, notes: notes2 }], _filePath: 'C:/Songs/Song.mid' } as unknown as ParsedMidi, handCheck: null })
  NES.reset()
  NES.editMidi = { tracks: [{ notes: edit }] } as any
  goToPassage(0, 0)
  markPassageCorrect()
  check(NES.dirty && NES.history.canUndo, 'confirming makes the song unsaved, and it can be undone')
  check((edit[1] as any).handSource === 'manual' && (edit[1] as any).handConfidence === 1, 'the saved copy keeps those hands as yours')
  check(buildNoteEditSummary(NES.history.appliedDescriptions()) === 'confirmed the hands in 1 passage', `the Edits badge says so: ${buildNoteEditSummary(NES.history.appliedDescriptions())}`)
  NES.history.undo()
  check(notes2[1].handConfidence === 0.2 && (edit[1] as any).handSource !== 'manual' && passagesOf(0).length === 1, 'undo: the passage is marked again')
  NES.reset()

  endHandCheck()
  console.log(`handCheck: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
