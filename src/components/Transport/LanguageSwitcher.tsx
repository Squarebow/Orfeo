import { useCallback, useRef, useState } from 'react'
import { Languages } from 'lucide-react'
import Tooltip from '../Tooltip'
import { ContextMenu, ContextMenuDivider, ContextMenuItem, useMenuDismiss } from '../ContextMenu'
import { confirmDialog } from '../../utils/confirmController'
import { SYSTEM, changeLanguage, currentChoice, currentLanguage, hasWords, t } from '../../utils/i18n'
import { languageName } from '../../i18n/languageNames'
import { menuItems, pickChangesLanguage } from '../../i18n/menuItems'
import { useStore } from '../../store'

const MENU_WIDTH = 150
const WEBLATE_PROJECT = 'https://hosted.weblate.org/projects/orfeo/app/'

// ── Language icon under the logo. Translations are still growing, so it's marked
// beta; a text with no translation yet simply stays in English. ───────────────
export function LanguageSwitcher() {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const show = useStore(s => s.showLanguageSwitcher)
  const menuLanguages = useStore(s => s.menuLanguages)
  const openSettingsWindow = useStore(s => s.openSettingsWindow)
  const closeMenu = useCallback(() => setMenu(null), [])
  useMenuDismiss(!!menu, menuRef, closeMenu)

  const choose = async (code: string) => {
    setMenu(null)
    if (!pickChangesLanguage(code, currentChoice, SYSTEM)) return
    const choice = await confirmDialog({
      title: t`Change language`,
      message: t`Orfeo reloads to change language.`,
      detail: t`The song stops, and changes you haven't saved are lost.`,
      buttons: [t`Change language`, t`Cancel`],
    })
    if (choice === 0) void changeLanguage(code)
  }

  if (!show) return <div style={{ height: 0, marginTop: 12, marginBottom: -13 }} />
  return (
    // Takes no height of its own, so the logo stays where it was. No transform
    // here: it would trap the menu inside the top bar, where it can't be seen.
    <div style={{ height: 0, marginTop: 12, marginBottom: -13 }}>
      <Tooltip disabled={!!menu} title={t`Language (beta)`} description={t`Translations are a work in progress, so some texts stay in English.`} placement="bottom">
        <button
          className="app-no-drag"
          aria-label={t`Language`}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setMenu(menu ? null : { x: r.left, y: r.bottom + 6 })
          }}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: menu ? 'var(--text-amber)' : 'var(--text-inactive)', transition: 'color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
          onMouseLeave={e => { if (!menu) e.currentTarget.style.color = 'var(--text-inactive)' }}
        >
          <Languages size={15} strokeWidth={1.5} />
          <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{t`Language`}</span>
        </button>
      </Tooltip>
      {menu && (
        <ContextMenu ref={menuRef} x={menu.x} y={menu.y} minWidth={MENU_WIDTH} ariaLabel={t`Language`} className="app-no-drag">
          {menuItems(menuLanguages, c => hasWords(c), currentLanguage).map(code => (
            <ContextMenuItem key={code} onClick={() => void choose(code)}>
              <span style={{ color: code === currentLanguage ? 'var(--text-amber)' : undefined }}>{languageName(code)}</span>
            </ContextMenuItem>
          ))}
          <ContextMenuDivider />
          <ContextMenuItem onClick={() => { setMenu(null); void window.electronAPI.openExternal(WEBLATE_PROJECT) }}>
            <span style={{ flex: 1 }}>{t`Help translate Orfeo`}</span>
            <Tooltip title={t`Open language settings`} placement="bottom">
              <span role="button" aria-label={t`Open language settings`}
                onClick={(e) => { e.stopPropagation(); setMenu(null); openSettingsWindow('language') }}
                style={{ display: 'flex', alignItems: 'center', marginLeft: 10, color: 'var(--text-inactive)', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-inactive)'}>
                <Languages size={13} strokeWidth={1.5} />
              </span>
            </Tooltip>
          </ContextMenuItem>
        </ContextMenu>
      )}
    </div>
  )
}
