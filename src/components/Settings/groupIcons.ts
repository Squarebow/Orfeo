import { Volume2, Files, Music, BookOpen, Music2, Piano, Columns3, Palette, type LucideIcon } from 'lucide-react'
import type { SettingsGroupId } from '../../types'

// Same icons the drawer's group headings have always used
export const GROUP_ICONS: Record<SettingsGroupId, LucideIcon> = {
  'audio': Volume2, 'midi-files-library': Files, 'playback-editing': Music, 'practice': BookOpen,
  'notation': Music2, 'keyboard': Piano, 'piano-roll': Columns3, 'appearance': Palette,
}
