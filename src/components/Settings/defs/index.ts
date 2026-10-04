import type { SettingId } from '../catalog'
import type { SettingDef } from '../types'
import { AUDIO_DEFS } from './audio'
import { LIBRARY_DEFS } from './library'
import { PLAYBACK_DEFS } from './playback'
import { PRACTICE_DEFS } from './practice'
import { NOTATION_DEFS } from './notation'
import { KEYBOARD_DEFS } from './keyboard'
import { PIANO_ROLL_DEFS } from './pianoRoll'
import { APPEARANCE_DEFS } from './appearance'

export const DEFS = Object.fromEntries(
  [...AUDIO_DEFS, ...LIBRARY_DEFS, ...PLAYBACK_DEFS, ...PRACTICE_DEFS, ...NOTATION_DEFS, ...KEYBOARD_DEFS, ...PIANO_ROLL_DEFS, ...APPEARANCE_DEFS]
    .map(d => [d.id, d]),
) as Record<SettingId, SettingDef>
