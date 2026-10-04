import { BookOpen, PanelLeftClose, Hand, Activity, Expand } from 'lucide-react'
import { useStore } from '../../../store'
import { Switch, InlineIcon } from '../controls'
import type { SettingDef } from '../types'

const PrompterIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect width="10" height="8" x="7" y="8" rx="1"/></svg>
)

export const PRACTICE_DEFS: SettingDef[] = [
  {
    id: 'chordPrompter', icon: BookOpen, kind: 'switch',
    Control: () => { const v = useStore(s => s.chordPrompterEnabled); return <Switch value={v} onChange={useStore.getState().setChordPrompterEnabled} label="Chord Prompter" /> },
    Description: () => <>Shows past, current and upcoming chords during playback. Click <InlineIcon><PrompterIcon /></InlineIcon> icon above keyboard to enable it.</>,
  },
  {
    id: 'closePanels', icon: PanelLeftClose, kind: 'switch',
    Control: () => { const v = useStore(s => s.autoCollapseDrawers); return <Switch value={v} onChange={useStore.getState().setAutoCollapseDrawers} label="Close panels on playback" /> },
    Description: () => <>Automatically hide side panels during playback to maximize the piano roll view. For full-screen view click <InlineIcon><Expand size={10} /></InlineIcon> to enter presentation mode.</>,
  },
  {
    id: 'handTags', icon: Hand, kind: 'switch',
    Control: () => { const v = useStore(s => s.showHandLetters); return <Switch value={v} onChange={useStore.getState().setShowHandLetters} label="Hand tags" /> },
  },
  {
    id: 'trackVu', icon: Activity, kind: 'switch',
    Control: () => { const v = useStore(s => s.trackVuColorEnabled); return <Switch value={v} onChange={useStore.getState().setTrackVuColorEnabled} label="Track color VU meters" /> },
  },
]
