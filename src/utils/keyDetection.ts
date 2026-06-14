import type { NoteNaming } from '../types'

// All keys indexed by semitone (0=C)
const MAJOR_ROOTS_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const MAJOR_ROOTS_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
const MAJOR_ROOTS_EU    = ['C','C#','D','D#','E','F','F#','G','G#','A','B','H']  // A#=B, B=H
const MAJOR_ROOTS_SOLF  = ['Do','Do#','Re','Re#','Mi','Fa','Fa#','Sol','Sol#','La','La#','Si']

// Minor: relative minor is 3 semitones below major root
// e.g. C major -> Am, G major -> Em etc
const MINOR_OFFSET = 9 // minor root = (major_root_idx + 9) % 12 ... actually simpler:

function getRootName(semitone: number, naming: NoteNaming, flat: boolean): string {
  if (naming === 'solfege') return MAJOR_ROOTS_SOLF[semitone]
  if (naming === 'central-european') return MAJOR_ROOTS_EU[semitone]
  if (flat) return MAJOR_ROOTS_FLAT[semitone]
  return MAJOR_ROOTS_SHARP[semitone]
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

export function parseKeySignature(ksKey: number, ksScale: string): DetectedKey {
  // ksKey: number of sharps (+) or flats (-)
  // Map circle of fifths to semitone
  const sharpOrder = [0,7,2,9,4,11,6,1,8,3,10,5] // C G D A E B F# C# Ab Eb Bb F
  const idx = ((ksKey % 12) + 12) % 12
  const semitone = sharpOrder[idx]
  const isMinor = ksScale === 'minor'
  // minor key root is 3 semitones below major
  const minorSemitone = isMinor ? (semitone + 9) % 12 : semitone
  return { semitone: isMinor ? minorSemitone : semitone, isMinor, transpose: 0 }
}

export function formatKey(key: DetectedKey | null | undefined, naming: NoteNaming): string {
  if (!key || key.semitone === undefined || key.isMinor === undefined) return '—'
  try {
    const semitone = key.semitone ?? 0
    const isMinor = key.isMinor ?? false
    const transpose = key.transpose ?? 0
    const transposedSemitone = ((semitone + transpose) % 12 + 12) % 12
    const flatKeys = new Set([1,3,8,10,6])
    const useFlat = flatKeys.has(transposedSemitone) && naming === 'english'
    const root = getRootName(transposedSemitone, naming, useFlat)
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