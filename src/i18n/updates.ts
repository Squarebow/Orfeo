// "Download now" and the start-up check: fetch the newest translation numbers, remember which
// languages are ready, and (unless the player chose to wait) download the ones that need it.
// Never changes the language in use and never reloads: new words show on the next start.
import { isCheckedReady, languagesToDownload, type LangStats, type ReadySources, type Snapshot } from './readiness'
import bundledTranslations from './translations.json'
import { currentLanguage as inUse, startup } from '../utils/i18n'

export interface Bridge {
  i18nRefresh: (force?: boolean) => Promise<{ stats: LangStats[] | null; remote: Snapshot | null; fetchedAt: number | null; offline: boolean }>
  i18nDownload: (code: string) => Promise<'saved' | 'invalid' | 'failed'>
  i18nRememberReady: (codes: string[]) => Promise<unknown> | unknown
}
export interface UpdateDeps {
  bridge: Bridge
  have: Record<string, string | null>
  seenReady: string[]
  bundled: Snapshot
  menuLanguages: string[]
  currentLanguage: string
  updates: 'download' | 'wait'
}
export type CheckResult = Awaited<ReturnType<Bridge['i18nRefresh']>>

export async function checkTranslations(opts: { force?: boolean }, deps: Partial<UpdateDeps> = {}): Promise<CheckResult> {
  const bridge = deps.bridge ?? (window.electronAPI as unknown as Bridge)
  const result = await bridge.i18nRefresh(opts.force)
  const { stats, remote } = result
  if (stats) {
    const ready = stats.filter(isCheckedReady).map(s => s.code)
    if (ready.length) await bridge.i18nRememberReady(ready)
  }
  const store = deps.menuLanguages && deps.updates ? null : (await import('../store')).useStore.getState()
  const updates = deps.updates ?? store!.translationUpdates
  if (updates !== 'download') return result
  const src: ReadySources = { live: stats, bundled: deps.bundled ?? (bundledTranslations as Snapshot), remote, seenReady: deps.seenReady ?? startup.boot?.seenReady ?? [] }
  const wanted = [...(deps.menuLanguages ?? store!.menuLanguages), deps.currentLanguage ?? inUse]
  for (const code of languagesToDownload(src, deps.have ?? startup.have, wanted)) {
    try { await bridge.i18nDownload(code) } catch { /* the next start tries again */ }
  }
  return result
}
