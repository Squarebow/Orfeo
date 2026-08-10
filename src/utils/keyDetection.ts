import type { NoteNaming, Accidentals } from '../types'

// All keys indexed by semitone (0=C)
const MAJOR_ROOTS_SHARP    = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const MAJOR_ROOTS_FLAT     = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
const MAJOR_ROOTS_EU_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','H']
const MAJOR_ROOTS_EU_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','B',  'H']
const MAJOR_ROOTS_SOLF_SHARP = ['Do','Do#','Re','Re#','Mi','Fa','Fa#','Sol','Sol#','La','La#','Si']
const MAJOR_ROOTS_SOLF_FLAT  = ['Do','Reb','Re','Mib','Mi','Fa','Solb','Sol','Lab','La','Sib','Si']

function getRootName(semitone: number, naming: NoteNaming, accidentals: Accidentals): string {
  const useSharp = accidentals === 'sharp'
  if (naming === 'solfege')          return useSharp ? MAJOR_ROOTS_SOLF_SHARP[semitone] : MAJOR_ROOTS_SOLF_FLAT[semitone]
  if (naming === 'central-european') return useSharp ? MAJOR_ROOTS_EU_SHARP[semitone]   : MAJOR_ROOTS_EU_FLAT[semitone]
  return useSharp ? MAJOR_ROOTS_SHARP[semitone] : MAJOR_ROOTS_FLAT[semitone]
}

// Krumhansl-Schmuckler profiles
const MAJOR_PROFILE = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88]
const MINOR_PROFILE = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17]

function correlate(counts: number[], profile: number[]): number {
  const meanC = counts.reduce((a,b)=>a+b,0)/12
  const meanP = profile.reduce((a,b)=>a+b,0)/12
  let num=0,denC=0,denP=0
  for(let i=0;i<12;i++){
    const dc=counts[i]-meanC, dp=profile[i]-meanP
    num+=dc*dp; denC+=dc*dc; denP+=dp*dp
  }
  return denC===0||denP===0 ? 0 : num/Math.sqrt(denC*denP)
}

export interface DetectedKey {
  semitone: number    // 0-11 (C=0)
  isMinor: boolean
  transpose: number   // current transpose offset
}

export function detectKeyFromTracks(tracks: any[]): DetectedKey {
  const counts = new Array(12).fill(0)
  for(const track of tracks){
    if(track.isDrum) continue
    for(const note of track.notes){
      counts[note.midi%12] += note.duration * note.velocity
    }
  }
  let bestSemitone=0, bestMinor=false, bestScore=-Infinity
  for(let i=0;i<12;i++){
    const rotated=[...counts.slice(i),...counts.slice(0,i)]
    const maj=correlate(rotated,MAJOR_PROFILE)
    const min=correlate(rotated,MINOR_PROFILE)
    if(maj>bestScore){bestScore=maj;bestSemitone=i;bestMinor=false}
    if(min>bestScore){bestScore=min;bestSemitone=i;bestMinor=true}
  }
  return { semitone: bestSemitone, isMinor: bestMinor, transpose: 0 }
}

// Note-name → semitone, for the string-keyed format @tonejs/midi's Header
// actually produces (see keySignatureKeys in its Header.js — the raw
// signed sharps/flats count is looked up into this table and only the
// resulting NAME is exposed, e.g. "F", "C#", "Bb"; the number itself never
// reaches midi.header.keySignatures[]). ksKey used to be typed as always
// numeric (a raw sharps/flats count) — that shape doesn't actually exist
// on real parsed files, so every file with a genuine key-signature meta
// event fed a string into `% 12`, silently producing NaN and permanently
// stuck the Key display at "—" no matter what (transpose still worked —
// it's a plain number stored separately, never touches this). ─────────────
// Reverse of KEY_NAME_TO_SEMITONE — canonical name per semitone (one pick
// per pitch class, matching whichever of the enharmonic spellings
// @tonejs/midi's own keySignatureKeys table also recognizes). Used by
// midiParser.ts to turn an ORFEO_KEY meta event's raw semitone back into
// the string shape parseKeySignature already expects. ─────────────────────
export const SEMITONE_TO_KEY_NAME = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

const KEY_NAME_TO_SEMITONE: Record<string, number> = {
  C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4,
  'E#': 5, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10,
  B: 11, Cb: 11,
}

export function parseKeySignature(ksKey: number | string, ksScale: string): DetectedKey {
  const isMinor = ksScale === 'minor'
  // The name @tonejs/midi gives is always the MAJOR key at that
  // sharps/flats count — for a minor scale it's the relative major's name
  // (e.g. Bb → "F", scale "minor" really means D minor, F major's
  // relative minor), same relationship the numeric path below encodes.
  let semitone: number
  if (typeof ksKey === 'string') {
    semitone = KEY_NAME_TO_SEMITONE[ksKey] ?? 0
  } else {
    // Legacy/defensive path — a raw signed sharps/flats count, in case a
    // future version of the parser (or a different caller) provides one.
    const sharpOrder = [0,7,2,9,4,11,6,1,8,3,10,5] // C G D A E B F# C# Ab Eb Bb F
    const idx = ((ksKey % 12) + 12) % 12
    semitone = sharpOrder[idx]
  }
  // minor key root is 3 semitones below its relative major
  const minorSemitone = isMinor ? (semitone + 9) % 12 : semitone
  return { semitone: isMinor ? minorSemitone : semitone, isMinor, transpose: 0 }
}

export function formatKey(
  key: DetectedKey | null | undefined,
  naming: NoteNaming,
  accidentals: Accidentals = 'flat',
): string {
  if (!key || key.semitone === undefined || key.isMinor === undefined) return '—'
  try {
    const semitone = key.semitone ?? 0
    const isMinor = key.isMinor ?? false
    const transpose = key.transpose ?? 0
    const transposedSemitone = ((semitone + transpose) % 12 + 12) % 12
    const root = getRootName(transposedSemitone, naming, accidentals)
    if (!root) return '—'
    if (naming === 'solfege') return root + (isMinor ? ' min' : ' maj')
    return root + (isMinor ? 'm' : '')
  } catch {
    return '—'
  }
}

export function transposeDetectedKey(key: DetectedKey, semitones: number): DetectedKey {
  return { ...key, transpose: key.transpose + semitones }
}