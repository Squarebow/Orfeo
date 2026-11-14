// Pure rules for Settings › Language: how each language shows in the tick list, and
// how the time the numbers were read is written.
import type { LangRow } from './readiness'

export interface TickState { checked: boolean; disabled: boolean; percent: number | null }

// A language with words on this computer that is ticked, or is the language in use, can always
// be ticked and unticked. Readiness only decides whether an unticked language can be ticked.
// Greyed languages show their percentage, except one whose words are on the way: its name alone.
export function tickState(r: LangRow, ticked: readonly string[], inUse: string, hasWords: (code: string) => boolean): TickState {
  const has = hasWords(r.code)
  const isTicked = ticked.includes(r.code)
  const disabled = !(has && (isTicked || r.code === inUse || r.tickable))
  return {
    checked: has && isTicked,
    disabled,
    percent: disabled && r.status.kind !== 'arriving' ? r.percent : null,
  }
}

// Date and time in the language in use; English, and anything the computer can't write, as British English
export function shortTime(ms: number, locale: string): string {
  const d = new Date(ms)
  const fmt = (loc: string) =>
    `${d.toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })}`
  try { return fmt(!locale || locale === 'en' ? 'en-GB' : locale) } catch { return fmt('en-GB') }
}
