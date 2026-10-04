import { FolderOpen, FileMusic } from 'lucide-react'
import { useStore } from '../../../store'
import { t } from '../../../utils/i18n'
import { Switch } from '../controls'
import type { SettingDef } from '../types'

export const LIBRARY_DEFS: SettingDef[] = [
  {
    id: 'showDemo', icon: FolderOpen, kind: 'switch',
    Control: () => { const hidden = useStore(s => s.hideDemoFolder); return <Switch value={!hidden} onChange={(v) => useStore.getState().setHideDemoFolder(!v)} label={t`Show demo content`} /> },
    // the line follows the switch, as in the old drawer
    Description: () => {
      const hidden = useStore(s => s.hideDemoFolder)
      return <>{hidden
        ? t`The demo songs that come with Orfeo are hidden from your Library. Turn on to show them again.`
        : t`The demo songs that come with Orfeo are shown in your Library. Turn off to hide them — nothing is deleted.`}</>
    },
  },
  {
    id: 'chordTranscription', icon: FileMusic, kind: 'switch', badge: 'beta',
    Control: () => { const v = useStore(s => s.chordTranscriptionEnabled); return <Switch value={v} onChange={useStore.getState().setChordTranscriptionEnabled} label="Chord Transcription" /> },
  },
]
