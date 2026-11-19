import type { CSSProperties } from 'react'
import { MicVocal } from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import { MarqueeText } from '../MarqueeText'

// ── A Library row's song name, with the amber lyrics mark when the song carries
// lyrics (Settings › Show files with lyrics). The mark is pinned at the right end of
// the name's space, just before the star: a long name scrolls under it on hover
// while the mark stays put and always shows. It's drawn here, never part of the
// name, so renaming can't touch it. Also used by the practice queue's list. ────
export function LibrarySongName({ path, name, spanStyle }: { path: string; name: string; spanStyle: CSSProperties }) {
  const mark = useStore(s => s.showLyricsMark && s.lyricsIndex[path]?.lyrics === true)
  return (
    <>
      <MarqueeText name={name} spanStyle={spanStyle} />
      {mark && (
        <span aria-label={t`Has lyrics`} style={{ display: 'inline-flex', alignSelf: 'center', flexShrink: 0, marginLeft: 4, color: 'var(--text-amber)' }}>
          <MicVocal size={11} strokeWidth={1.75} />
        </span>
      )}
    </>
  )
}
