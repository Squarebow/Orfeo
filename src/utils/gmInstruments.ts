// General MIDI instrument names and groups
import { n } from '../i18n/mark'

export interface GMInstrument {
  program: number
  name: string
  group: string
}

export const GM_GROUPS: Record<string, { label: string; programs: number[] }> = {
  piano:        { label: n('Piano'),           programs: [0,1,2,3,4,5,6,7] },
  chromatic:    { label: n('Chromatic Perc'),  programs: [8,9,10,11,12,13,14,15] },
  organ:        { label: n('Organ'),           programs: [16,17,18,19,20,21,22,23] },
  guitar:       { label: n('Guitar'),          programs: [24,25,26,27,28,29,30,31] },
  bass:         { label: n('Bass'),            programs: [32,33,34,35,36,37,38,39] },
  strings:      { label: n('Strings'),         programs: [40,41,42,43,44,45,46,47] },
  ensemble:     { label: n('Ensemble'),        programs: [48,49,50,51,52,53,54,55] },
  brass:        { label: n('Brass'),           programs: [56,57,58,59,60,61,62,63] },
  reed:         { label: n('Reed'),            programs: [64,65,66,67,68,69,70,71] },
  pipe:         { label: n('Pipe'),            programs: [72,73,74,75,76,77,78,79] },
  synth_lead:   { label: n('Synth Lead'),      programs: [80,81,82,83,84,85,86,87] },
  synth_pad:    { label: n('Synth Pad'),       programs: [88,89,90,91,92,93,94,95] },
  synth_fx:     { label: n('Synth FX'),        programs: [96,97,98,99,100,101,102,103] },
  ethnic:       { label: n('Ethnic'),          programs: [104,105,106,107,108,109,110,111] },
  percussive:   { label: n('Percussive'),      programs: [112,113,114,115,116,117,118,119] },
  sfx:          { label: n('Sound FX'),        programs: [120,121,122,123,124,125,126,127] },
  drums:        { label: n('Drums'),           programs: [-1] }, // channel 9
}

// Keyboard instruments — these light up the piano keys
export const KEYBOARD_PROGRAMS = new Set([
  ...GM_GROUPS.piano.programs,
  ...GM_GROUPS.chromatic.programs,
  ...GM_GROUPS.organ.programs,
])

export const GM_NAMES: string[] = [
  // Piano (0-7)
  n('Acoustic Grand Piano'),n('Bright Acoustic Piano'),n('Electric Grand Piano'),n('Honky-tonk Piano'),
  n('Electric Piano 1'),n('Electric Piano 2'),n('Harpsichord'),n('Clavinet'),
  // Chromatic Perc (8-15)
  n('Celesta'),n('Glockenspiel'),n('Music Box'),n('Vibraphone'),
  n('Marimba'),n('Xylophone'),n('Tubular Bells'),n('Dulcimer'),
  // Organ (16-23)
  n('Drawbar Organ'),n('Percussive Organ'),n('Rock Organ'),n('Church Organ'),
  n('Reed Organ'),n('Accordion'),n('Harmonica'),n('Tango Accordion'),
  // Guitar (24-31)
  n('Nylon Guitar'),n('Steel Guitar'),n('Jazz Guitar'),n('Clean Guitar'),
  n('Muted Guitar'),n('Overdriven Guitar'),n('Distortion Guitar'),n('Guitar Harmonics'),
  // Bass (32-39)
  n('Acoustic Bass'),n('Finger Bass'),n('Pick Bass'),n('Fretless Bass'),
  n('Slap Bass 1'),n('Slap Bass 2'),n('Synth Bass 1'),n('Synth Bass 2'),
  // Strings (40-47)
  n('Violin'),n('Viola'),n('Cello'),n('Contrabass'),
  n('Tremolo Strings'),n('Pizzicato Strings'),n('Orchestral Harp'),n('Timpani'),
  // Ensemble (48-55)
  n('String Ensemble 1'),n('String Ensemble 2'),n('Synth Strings 1'),n('Synth Strings 2'),
  n('Choir Aahs'),n('Voice Oohs'),n('Synth Voice'),n('Orchestra Hit'),
  // Brass (56-63)
  n('Trumpet'),n('Trombone'),n('Tuba'),n('Muted Trumpet'),
  n('French Horn'),n('Brass Section'),n('Synth Brass 1'),n('Synth Brass 2'),
  // Reed (64-71)
  n('Soprano Sax'),n('Alto Sax'),n('Tenor Sax'),n('Baritone Sax'),
  n('Oboe'),n('English Horn'),n('Bassoon'),n('Clarinet'),
  // Pipe (72-79)
  n('Piccolo'),n('Flute'),n('Recorder'),n('Pan Flute'),
  n('Blown Bottle'),n('Shakuhachi'),n('Whistle'),n('Ocarina'),
  // Synth Lead (80-87)
  n('Lead 1 Square'),n('Lead 2 Sawtooth'),n('Lead 3 Calliope'),n('Lead 4 Chiff'),
  n('Lead 5 Charang'),n('Lead 6 Voice'),n('Lead 7 Fifths'),n('Lead 8 Bass+Lead'),
  // Synth Pad (88-95)
  n('Pad 1 New Age'),n('Pad 2 Warm'),n('Pad 3 Polysynth'),n('Pad 4 Choir'),
  n('Pad 5 Bowed'),n('Pad 6 Metallic'),n('Pad 7 Halo'),n('Pad 8 Sweep'),
  // Synth FX (96-103)
  n('FX 1 Rain'),n('FX 2 Soundtrack'),n('FX 3 Crystal'),n('FX 4 Atmosphere'),
  n('FX 5 Brightness'),n('FX 6 Goblins'),n('FX 7 Echoes'),n('FX 8 Sci-fi'),
  // Ethnic (104-111)
  n('Sitar'),n('Banjo'),n('Shamisen'),n('Koto'),
  n('Kalimba'),n('Bag Pipe'),n('Fiddle'),n('Shanai'),
  // Percussive (112-119)
  n('Tinkle Bell'),n('Agogo'),n('Steel Drums'),n('Woodblock'),
  n('Taiko Drum'),n('Melodic Tom'),n('Synth Drum'),n('Reverse Cymbal'),
  // SFX (120-127)
  n('Guitar Fret Noise'),n('Breath Noise'),n('Seashore'),n('Bird Tweet'),
  n('Telephone Ring'),n('Helicopter'),n('Applause'),n('Gunshot'),
]

export function getGMName(program: number): string {
  if (program < 0 || program > 127) return 'Unknown'
  return GM_NAMES[program] ?? `Program ${program}`
}

export function getGMGroup(program: number, isDrum: boolean): string {
  if (isDrum) return 'drums'
  for (const [key, group] of Object.entries(GM_GROUPS)) {
    if (key === 'drums') continue
    if (group.programs.includes(program)) return key
  }
  return 'sfx'
}

export function isKeyboardInstrument(program: number): boolean {
  return KEYBOARD_PROGRAMS.has(program)
}