// ── How the practice score is written and looks (Settings › Score) ──────────
// One set of choices, kept with the other settings (store: scoreOptions).

export type ScoreWriting = 'auto' | 'full' | 'simple'   // auto: Orfeo picks as written or simplified
export type ScoreChords = 'off' | 'main' | 'all'        // chord names above the treble staff

export interface ScoreOptions {
  writing: ScoreWriting
  chords: ScoreChords
  triplets: boolean       // a beat in three written as a triplet
  swing: boolean          // a swung song written in straight eighths, with a note
  voices: boolean         // a held note under moving ones gets its own voice
  pedal: boolean          // sustain pedal marks under the bass staff
}

export const DEFAULT_SCORE_OPTIONS: ScoreOptions = { writing: 'auto', chords: 'main', triplets: true, swing: true, voices: true, pedal: true }

/** Saved choices on top of the defaults, anything unknown dropped */
export function readScoreOptions(raw: unknown): ScoreOptions {
  const o = { ...DEFAULT_SCORE_OPTIONS }
  if (!raw || typeof raw !== 'object') return o
  const r = raw as Record<string, unknown>
  if (r.writing === 'auto' || r.writing === 'full' || r.writing === 'simple') o.writing = r.writing
  if (r.chords === 'off' || r.chords === 'main' || r.chords === 'all') o.chords = r.chords
  for (const k of ['triplets', 'swing', 'voices', 'pedal'] as const) if (typeof r[k] === 'boolean') o[k] = r[k] as boolean
  return o
}
