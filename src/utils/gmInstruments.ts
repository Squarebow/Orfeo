// General MIDI instrument names and groups

export interface GMInstrument {
  program: number
  name: string
  group: string
}

export const GM_GROUPS: Record<string, { label: string; programs: number[] }> = {
  piano:        { label: 'Piano',           programs: [0,1,2,3,4,5,6,7] },
  chromatic:    { label: 'Chromatic Perc',  programs: [8,9,10,11,12,13,14,15] },
  organ:        { label: 'Organ',           programs: [16,17,18,19,20,21,22,23] },
  guitar:       { label: 'Guitar',          programs: [24,25,26,27,28,29,30,31] },
  bass:         { label: 'Bass',            programs: [32,33,34,35,36,37,38,39] },
  strings:      { label: 'Strings',         programs: [40,41,42,43,44,45,46,47] },
  ensemble:     { label: 'Ensemble',        programs: [48,49,50,51,52,53,54,55] },
  brass:        { label: 'Brass',           programs: [56,57,58,59,60,61,62,63] },
  reed:         { label: 'Reed',            programs: [64,65,66,67,68,69,70,71] },
  pipe:         { label: 'Pipe',            programs: [72,73,74,75,76,77,78,79] },
  synth_lead:   { label: 'Synth Lead',      programs: [80,81,82,83,84,85,86,87] },
  synth_pad:    { label: 'Synth Pad',       programs: [88,89,90,91,92,93,94,95] },
  synth_fx:     { label: 'Synth FX',        programs: [96,97,98,99,100,101,102,103] },
  ethnic:       { label: 'Ethnic',          programs: [104,105,106,107,108,109,110,111] },
  percussive:   { label: 'Percussive',      programs: [112,113,114,115,116,117,118,119] },
  sfx:          { label: 'Sound FX',        programs: [120,121,122,123,124,125,126,127] },
  drums:        { label: 'Drums',           programs: [-1] }, // channel 9
}

// Keyboard instruments — these light up the piano keys
export const KEYBOARD_PROGRAMS = new Set([
  ...GM_GROUPS.piano.programs,
  ...GM_GROUPS.chromatic.programs,
  ...GM_GROUPS.organ.programs,
])

export const GM_NAMES: string[] = [
  // Piano (0-7)
  'Acoustic Grand Piano','Bright Acoustic Piano','Electric Grand Piano','Honky-tonk Piano',
  'Electric Piano 1','Electric Piano 2','Harpsichord','Clavinet',
  // Chromatic Perc (8-15)
  'Celesta','Glockenspiel','Music Box','Vibraphone',
  'Marimba','Xylophone','Tubular Bells','Dulcimer',
  // Organ (16-23)
  'Drawbar Organ','Percussive Organ','Rock Organ','Church Organ',
  'Reed Organ','Accordion','Harmonica','Tango Accordion',
  // Guitar (24-31)
  'Nylon Guitar','Steel Guitar','Jazz Guitar','Clean Guitar',
  'Muted Guitar','Overdriven Guitar','Distortion Guitar','Guitar Harmonics',
  // Bass (32-39)
  'Acoustic Bass','Finger Bass','Pick Bass','Fretless Bass',
  'Slap Bass 1','Slap Bass 2','Synth Bass 1','Synth Bass 2',
  // Strings (40-47)
  'Violin','Viola','Cello','Contrabass',
  'Tremolo Strings','Pizzicato Strings','Orchestral Harp','Timpani',
  // Ensemble (48-55)
  'String Ensemble 1','String Ensemble 2','Synth Strings 1','Synth Strings 2',
  'Choir Aahs','Voice Oohs','Synth Voice','Orchestra Hit',
  // Brass (56-63)
  'Trumpet','Trombone','Tuba','Muted Trumpet',
  'French Horn','Brass Section','Synth Brass 1','Synth Brass 2',
  // Reed (64-71)
  'Soprano Sax','Alto Sax','Tenor Sax','Baritone Sax',
  'Oboe','English Horn','Bassoon','Clarinet',
  // Pipe (72-79)
  'Piccolo','Flute','Recorder','Pan Flute',
  'Blown Bottle','Shakuhachi','Whistle','Ocarina',
  // Synth Lead (80-87)
  'Lead 1 Square','Lead 2 Sawtooth','Lead 3 Calliope','Lead 4 Chiff',
  'Lead 5 Charang','Lead 6 Voice','Lead 7 Fifths','Lead 8 Bass+Lead',
  // Synth Pad (88-95)
  'Pad 1 New Age','Pad 2 Warm','Pad 3 Polysynth','Pad 4 Choir',
  'Pad 5 Bowed','Pad 6 Metallic','Pad 7 Halo','Pad 8 Sweep',
  // Synth FX (96-103)
  'FX 1 Rain','FX 2 Soundtrack','FX 3 Crystal','FX 4 Atmosphere',
  'FX 5 Brightness','FX 6 Goblins','FX 7 Echoes','FX 8 Sci-fi',
  // Ethnic (104-111)
  'Sitar','Banjo','Shamisen','Koto',
  'Kalimba','Bag Pipe','Fiddle','Shanai',
  // Percussive (112-119)
  'Tinkle Bell','Agogo','Steel Drums','Woodblock',
  'Taiko Drum','Melodic Tom','Synth Drum','Reverse Cymbal',
  // SFX (120-127)
  'Guitar Fret Noise','Breath Noise','Seashore','Bird Tweet',
  'Telephone Ring','Helicopter','Applause','Gunshot',
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