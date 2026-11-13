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
  saved: Record<string, string | null>
}
export type CheckResult = Awaited<ReturnType<Bridge['i18nRefresh']>>

// Languages saved this session and the version they were saved at, so later checks don't fetch them again
const savedThisSession: Record<string, string | null> = {}

// Forget what this session saved (the Dev Tools panel does this when its pretend numbers go away)
export function resetSavedThisSession(): void { for (const k of Object.keys(savedThisSession)) delete savedThisSession[k] }

export async function checkTranslations(opts: { force?: boolean }, deps: Partial<UpdateDeps> = {}): Promise<CheckResult> {
  const bridge = deps.bridge ?? (window.electronAPI as unknown as Bridge)
  const result = await bridge.i18nRefresh(opts.force)
  const { stats, remote } = result
  if (stats) {
    const ready = stats.filter(isCheckedReady).map(s => s.code)
    if (ready.length) await bridge.i18nRememberReady(ready)
  }
  let store: { translationUpdates: 'download' | 'wait'; menuLanguages: string[] } | null = null
  if (!(deps.menuLanguages && deps.updates)) {
    try { store = (await import('../store')).useStore.getState() } catch { /* no store: wait, no menu */ }
  }
  const updates = deps.updates ?? store?.translationUpdates ?? 'wait'
  if (updates !== 'download') return result
  const src: ReadySources = { live: stats, bundled: deps.bundled ?? (bundledTranslations as Snapshot), remote, seenReady: deps.seenReady ?? startup.boot?.seenReady ?? [] }
  const wanted = [...(deps.menuLanguages ?? store?.menuLanguages ?? []), deps.currentLanguage ?? inUse]
  const saved = deps.saved ?? savedThisSession
  for (const code of languagesToDownload(src, { ...(deps.have ?? startup.have), ...saved }, wanted)) {
    try {
      if (await bridge.i18nDownload(code) === 'saved') {
        const c = stats?.find(x => x.code === code) ?? remote?.[code] ?? src.bundled[code]
        saved[code] = c?.lastChange ?? null
      }
    } catch { /* the next start tries again */ }
  }
  return result
}
