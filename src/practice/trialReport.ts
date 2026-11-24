// ── Why a song isn't a lesson yet, in words (Try it as it is) ───────────────
// After trying a song as it is, the trial card (PracticeTrialCard.tsx) says
// what's missing, what that holds back, what the Lesson check found, and what
// to do, with the button that does it.
import { useStore } from '../store'
import { t } from '../utils/i18n'
import { currentSongPractice, currentSongCheck } from './practiceMode'
import { problemText, suggestionText } from '../components/MidiEditor/LessonCheck'

export interface TrialReport {
  /** what the song is, as a lesson sees it */
  why: string
  /** what Orfeo's Lesson check found, as it says it */
  found: string[]
  /** the next step */
  todo: string
  /** which button does it */
  action: 'prepare' | 'lesson-check' | null
}

export function trialReport(): TrialReport | null {
  const s = useStore.getState()
  const st = currentSongPractice()
  if (!s.midi || !st || st.state === 'ready' || st.state === 'one-hand') return null
  const plain = (i: number) => {
    const ts = s.tracks.find(x => x.index === i)
    return (ts?.trackName || s.midi?.tracks.find(x => x.index === i)?.name || t`track ${i + 1}`).trim()
  }
  // tracks with the same name are told apart by their number in the Tracks panel
  const name = (i: number) => {
    const n = plain(i)
    return s.tracks.some(x => x.index !== i && plain(x.index) === n) ? `${n} (${t`track ${i + 1}`})` : n
  }
  let why: string
  let todo: string
  let action: TrialReport['action']
  if (st.state === 'prepare') {
    why = st.tracks.length === 1
      ? (st.passages > 0
        ? t`The piano is one track with both hands in it, so Orfeo guessed which hand plays each note, and isn't sure in ${st.passages} places.`
        : t`The piano is one track with both hands in it: Orfeo is sure of its guess, but nobody has checked it yet.`)
      : t`The piano comes as two parts that aren't the two hands, so Orfeo guessed the hands across both.`
    todo = t`Prepare it: Orfeo takes you through the places it isn't sure of, you fix any note in the wrong hand, then Split & Save gives each hand its own track. You come back here, at this bar.`
    action = 'prepare'
  } else if (st.reason === 'too-many') {
    why = t`This song has ${st.pianos} piano tracks. A lesson is exactly two: the piano's left hand and right hand.`
    todo = t`Open the Lesson check: it shows which piano parts to leave out or merge, with a button for each. Save, and the song can be prepared.`
    action = 'lesson-check'
  } else if (st.reason === 'messy') {
    why = t`The piano's notes are doubled, or repeated faster than a hand can play, all the way through: the file itself is faulty.`
    todo = t`Open the Lesson check: it shows whether a track can be left out. If not, try another version of the song.`
    action = 'lesson-check'
  } else {
    why = t`There's no piano part in this song: you're trying its keyboard part instead.`
    todo = t`Open the Lesson check: a harpsichord, clavinet or organ part of its own can be given a piano sound, and then prepared.`
    action = 'lesson-check'
  }
  const check = currentSongCheck()
  const found = check ? [...check.problems.map(problemText), ...check.suggestions.map(x => suggestionText(x, name))].slice(0, 5) : []
  return { why, found, todo, action }
}
