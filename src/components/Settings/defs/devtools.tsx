import { KeyboardMusic, Music2, TriangleAlert, ListOrdered, MicVocal, MousePointerClick, Heart } from 'lucide-react'
import type { SettingDef } from '../types'
import { SimulatorPanel } from './midi'
import { ExplorersHearPreview, UnsavedWarningPreview } from './playback'
import { QueueTestPanel, LyricsTestPanel, OpenWithTestPanel } from './library'
import { SupportNotePreview } from './appearance'

// ── Dev Tools — every "test builds only" tool in one group, shown only in dev
// mode (simAvailable: npm run dev, test builds, Ctrl+Alt+Shift+D). Each tool is
// still its own panel from the group it tests; to be sorted into tabs later. ──
export const DEVTOOLS_DEFS: SettingDef[] = [
  { id: 'devKeyboard', icon: KeyboardMusic, kind: 'choice', Control: SimulatorPanel },
  { id: 'devExplorers', icon: Music2, kind: 'choice', Control: ExplorersHearPreview },
  { id: 'devClosingWarning', icon: TriangleAlert, kind: 'choice', Control: UnsavedWarningPreview },
  { id: 'devQueue', icon: ListOrdered, kind: 'choice', Control: QueueTestPanel },
  { id: 'devLyrics', icon: MicVocal, kind: 'choice', Control: LyricsTestPanel },
  { id: 'devOpenWith', icon: MousePointerClick, kind: 'choice', Control: OpenWithTestPanel },
  { id: 'devSupportNote', icon: Heart, kind: 'choice', Control: SupportNotePreview },
]
