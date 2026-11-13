import { useEffect, useState, type CSSProperties } from 'react'
import { Eye, Globe, ListChecks, Languages, CloudDownload } from 'lucide-react'
import { useStore } from '../../../store'
import { t } from '../../../utils/i18n'
import { SYSTEM, changeLanguage, currentChoice, currentLanguage, startup } from '../../../utils/i18n'
import { confirmDialog } from '../../../utils/confirmController'
import { buildRows, READY_SHARE, type LangRow, type LangStatus, type ReadySources, type Snapshot } from '../../../i18n/readiness'
import { checkTranslations, resetSavedThisSession, type CheckResult } from '../../../i18n/updates'
import { languageName } from '../../../i18n/languageNames'
import bundledTranslations from '../../../i18n/translations.json'
import { Switch } from '../controls'
import type { SettingDef } from '../types'

const WEBLATE = 'https://hosted.weblate.org/projects/orfeo/app/'

// ── The newest check of the Weblate numbers, shared by the cards on this page.
// Until one finishes (or if none can), the numbers read at start-up are used. ──
interface Latest { result: CheckResult | null; failed: boolean }
let latest: Latest = { result: null, failed: false }
const listeners = new Set<() => void>()
function setLatest(next: Latest) { latest = next; listeners.forEach(f => f()) }

function useLatest(): Latest {
  const [, bump] = useState(0)
  useEffect(() => {
    const f = () => bump(n => n + 1)
    listeners.add(f)
    return () => { listeners.delete(f) }
  }, [])
  return latest
}

// Every time the Translations card opens: ask once (the hour limit applies inside)
function useCheckOnOpen() {
  useEffect(() => {
    let live = true
    checkTranslations({}).then(
      r => { if (live) setLatest({ result: r, failed: false }) },
      () => { if (live) setLatest({ result: latest.result, failed: true }) },
    )
    return () => { live = false }
  }, [])
}

function useRows(): { rows: LangRow[]; fetchedAt: number | null; offline: boolean } {
  const l = useLatest()
  const updates = useStore(s => s.translationUpdates)
  const src: ReadySources = {
    live: l.result?.stats?.length ? l.result.stats : startup.boot?.stats ?? null,
    bundled: bundledTranslations as Snapshot,
    remote: l.result?.remote ?? startup.boot?.remote ?? null,
    seenReady: startup.boot?.seenReady ?? [],
  }
  return {
    rows: buildRows(src, startup.have, updates),
    fetchedAt: l.result?.fetchedAt ?? startup.boot?.fetchedAt ?? null,
    offline: l.failed || !!l.result?.offline,
  }
}

const shortTime = (ms: number): string =>
  `${new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} ${new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`

function statusText(s: LangStatus): string {
  switch (s.kind) {
    case 'upToDate': return t`Up to date`
    case 'newTranslations': return t`New translations`
    case 'newWords': return s.count === 1 ? t`1 new word` : t`${s.count} new words`
    case 'needs': return t`Needs ${s.percent} % more`
    case 'arriving': return s.when === 'nextStart' ? t`Next start` : t`With the next Orfeo`
  }
}

const open = (url: string) => window.electronAPI.openExternal(url)

const linkBtn: CSSProperties = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-amber)',
  fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', textAlign: 'left', minWidth: 0,
}

// ── Show language switcher ──
function ShowSwitcherControl() {
  const on = useStore(s => s.showLanguageSwitcher)
  return <Switch value={on} onChange={useStore.getState().setShowLanguageSwitcher} label={t`Show language switcher`} />
}

// ── Follow system language: same reload question as the menu ──
function FollowSystemControl() {
  const change = async (on: boolean) => {
    const choice = await confirmDialog({
      title: t`Change language`,
      message: t`Orfeo reloads to change language.`,
      detail: t`The song stops, and changes you haven't saved are lost.`,
      buttons: [t`Change language`, t`Cancel`],
    })
    if (choice === 0) void changeLanguage(on ? SYSTEM : currentLanguage)
  }
  return <Switch value={currentChoice === SYSTEM} onChange={on => void change(on)} label={t`Follow system language`} />
}

// ── Languages in the menu: three columns, filling down then across ──
function Tick({ checked, disabled, label, onClick }: { checked: boolean; disabled?: boolean; label: string; onClick?: () => void }) {
  return (
    <button role="checkbox" aria-checked={checked} aria-disabled={disabled} onClick={disabled ? undefined : onClick}
      style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr)', alignItems: 'center', gap: 8, padding: '5px 0', background: 'none', border: 'none',
        cursor: disabled ? 'default' : 'pointer', textAlign: 'left', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-xs)',
        color: disabled ? 'var(--text-muted)' : 'var(--text-default)' }}>
      <span style={{ width: 14, height: 14, boxSizing: 'border-box', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, lineHeight: 1,
        border: `1px solid ${checked ? (disabled ? 'var(--border2)' : 'var(--text-amber)') : 'var(--border2)'}`,
        background: checked ? (disabled ? 'var(--bg-row)' : 'var(--text-amber)') : 'none',
        color: disabled ? 'var(--text-muted)' : 'var(--bg-modal)' }}>{checked ? '✓' : ''}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  )
}

function MenuLanguagesControl() {
  const { rows } = useRows()
  const ticked = useStore(s => s.menuLanguages)
  const toggle = (code: string) => {
    const s = useStore.getState()
    s.setMenuLanguages(s.menuLanguages.includes(code) ? s.menuLanguages.filter(c => c !== code) : [...s.menuLanguages, code])
  }
  const count = rows.length + 1
  return (
    <div style={{ display: 'grid', gridAutoFlow: 'column', gridTemplateRows: `repeat(${Math.ceil(count / 3)}, auto)`, gridAutoColumns: 'minmax(0, 1fr)', columnGap: 16 }}>
      <Tick checked disabled label={languageName('en')} />
      {rows.map(r => r.tickable
        ? <Tick key={r.code} checked={ticked.includes(r.code)} label={languageName(r.code)} onClick={() => toggle(r.code)} />
        : <Tick key={r.code} checked={false} disabled label={`${languageName(r.code)} (${r.percent} %)`} />)}
    </div>
  )
}

// ── Translations: the table ──
const COLUMNS = 'minmax(110px, 22%) minmax(0, 1fr) 44px 140px'
const headCell: CSSProperties = { fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }

function TranslationsControl() {
  useCheckOnOpen()
  const { rows, fetchedAt, offline } = useRows()
  const when = fetchedAt !== null ? shortTime(fetchedAt) : null
  const note = offline
    ? (when ? t`Weblate can't be reached. Numbers from ${when}.` : t`Weblate can't be reached.`)
    : when ? t`Numbers from Weblate, ${when}` : null
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: COLUMNS, columnGap: 10, paddingBottom: 6 }}>
        <div style={headCell}>{t`Language`}</div><div style={headCell}>{t`Translated`}</div><div /><div style={headCell}>{t`Status`}</div>
      </div>
      {rows.map(r => (
        <div key={r.code} style={{ display: 'grid', gridTemplateColumns: COLUMNS, columnGap: 10, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--border-row)' }}>
          <button onClick={() => open(`${WEBLATE}${r.code}/`)} style={{ ...linkBtn, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{languageName(r.code)} ↗</button>
          <div style={{ position: 'relative', height: 8, borderRadius: 4, background: 'var(--border)' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, r.percent)}%`, borderRadius: 4, background: r.ready ? 'var(--text-amber)' : 'var(--text-inactive)' }} />
            <div style={{ position: 'absolute', left: `${READY_SHARE * 100}%`, top: -4, bottom: -4, width: 2, background: 'var(--text-default)', opacity: 0.55 }} />
          </div>
          <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-default)' }}>{r.percent} %</div>
          <div title={statusText(r.status)} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', fontFamily: 'var(--font-ui)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{statusText(r.status)}</div>
        </div>
      ))}
      <div style={{ marginTop: 10, fontSize: 'var(--text-xs)', color: 'var(--text-faint)', fontFamily: 'var(--font-ui)', lineHeight: 1.5 }}>
        {t`Your language isn't listed?`}{' '}
        <button onClick={() => open(WEBLATE)} style={linkBtn}>{t`Start it on Weblate ↗`}</button>
        {note && <> · {note}</>}
      </div>
    </div>
  )
}

// ── Translation updates: exactly one of two switches is on ──
function UpdatesControl() {
  const mode = useStore(s => s.translationUpdates)
  const set = useStore(s => s.setTranslationUpdates)
  const row = (value: 'download' | 'wait', name: string, text: string, first: boolean) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', columnGap: 12, padding: first ? '0 0 8px' : '8px 0 0', borderTop: first ? 'none' : '1px solid var(--border-row)' }}>
      <div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-default)', fontFamily: 'var(--font-ui)' }}>{name}</div>
        <div style={{ marginTop: 2, fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.5, fontFamily: 'var(--font-ui)', fontStyle: 'italic' }}>{text}</div>
      </div>
      <Switch value={mode === value} onChange={() => set(value)} label={name} />
    </div>
  )
  return (
    <div style={{ marginTop: -4 }}>
      {row('download', t`Download now`, t`Turn on to get new translations as soon as they are made. Orfeo downloads them and uses them the next time it starts.`, true)}
      {row('wait', t`Wait for new version of Orfeo`, t`Turn on to get new translations only when you update Orfeo.`, false)}
    </div>
  )
}

// ── Dev Tools › Translations: pretend numbers, session only (nothing saved) ──
const PRESETS = [0, 42, 79, 80, 100]
const devBtn: CSSProperties = {
  background: 'var(--bg-row)', border: '1px solid var(--border2)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer',
  color: 'var(--text-default)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)',
}

export function TranslationsTestPanel() {
  const l = useLatest()
  const stats = l.result?.stats ?? startup.boot?.stats ?? null
  const [percents, setPercents] = useState<Record<string, number>>({})
  const [offline, setOffline] = useState(false)
  const [newer, setNewer] = useState(false)
  const [msg, setMsg] = useState('')
  const dev = window.electronAPI as unknown as { i18nDev: (o: object) => Promise<void> }
  // closing Settings throws the panel's choices away, so the pretend numbers go too
  useEffect(() => () => { void dev.i18nDev({}); resetSavedThisSession() }, [])  // eslint-disable-line react-hooks/exhaustive-deps
  const apply = async () => {
    setMsg('Checking...')
    try {
      await dev.i18nDev({ percents, offline, newer })
      const r = await checkTranslations({ force: true })
      setLatest({ result: r, failed: false })
      setMsg(r.offline ? 'Done: Weblate counted as not reachable.' : 'Done: the Language page now shows these numbers.')
    } catch { setLatest({ result: latest.result, failed: true }); setMsg('The check failed.') }
  }
  const clear = async () => {
    setPercents({}); setOffline(false); setNewer(false)
    await dev.i18nDev({}); resetSavedThisSession()
    try { setLatest({ result: await checkTranslations({ force: true }), failed: false }); setMsg('Cleared: the real numbers are back.') } catch { setMsg('Cleared. The real check failed.') }
  }
  const tick = (label: string, v: boolean, set: (b: boolean) => void) => <Tick checked={v} label={label} onClick={() => set(!v)} />
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {stats === null && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>No numbers yet: open Settings › Language once, or press Apply.</div>}
      {stats?.map(s => (
        <div key={s.code} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 22%) minmax(0, 1fr)', columnGap: 10, alignItems: 'center' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-default)', fontFamily: 'var(--font-ui)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{languageName(s.code)}</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {PRESETS.map(p => (
              <button key={p} onClick={() => setPercents(o => { const n = { ...o }; if (n[s.code] === p) delete n[s.code]; else n[s.code] = p; return n })}
                style={{ ...devBtn, color: percents[s.code] === p ? 'var(--bg-modal)' : 'var(--text-default)', background: percents[s.code] === p ? 'var(--text-amber)' : 'var(--bg-row)' }}>{p} %</button>
            ))}
          </div>
        </div>
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 12 }}>
        {tick('Pretend offline', offline, setOffline)}
        {tick('Pretend Weblate has newer words', newer, setNewer)}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={() => void apply()} style={devBtn}>Apply and check again</button>
        <button onClick={() => void clear()} style={devBtn}>Clear</button>
        <button onClick={() => void changeLanguage('pseudo')} style={devBtn}>Pseudo language</button>
        <button onClick={() => void changeLanguage('en')} style={devBtn}>Back to English</button>
      </div>
      {msg && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', fontFamily: 'var(--font-ui)' }}>{msg}</div>}
    </div>
  )
}

// This card has no description of its own: the two rows say it all
const NoDescription = () => null

export const LANGUAGE_DEFS: SettingDef[] = [
  { id: 'showLanguageSwitcher', icon: Eye, kind: 'switch', Control: ShowSwitcherControl },
  { id: 'followSystemLanguage', icon: Globe, kind: 'switch', Control: FollowSystemControl },
  { id: 'menuLanguages', icon: ListChecks, kind: 'choice', Control: MenuLanguagesControl },
  { id: 'translations', icon: Languages, kind: 'choice', Control: TranslationsControl },
  { id: 'translationUpdates', icon: CloudDownload, kind: 'choice', Control: UpdatesControl, Description: NoDescription },
]
