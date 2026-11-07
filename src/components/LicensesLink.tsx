// ── Licenses: a small link, and the window it opens ──────────────────────────
// Shows the copies of LICENSE.md and THIRD_PARTY_LICENSES.md that ship in every
// download (build.extraResources), so it works offline. The lines at the top are
// the GPL's "Appropriate Legal Notices": copyright, no warranty, how to read it.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { t } from '../utils/i18n'
import { modalCloseButtonStyle } from '../utils/modalCloseButtonStyle'
import { parseInline, parseLicenseMarkdown, type Block } from '../utils/licenseMarkdown'

type Texts = { orfeo: string; thirdParty: string }

const linkStyle: CSSProperties = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-amber)', font: 'inherit', textAlign: 'left', overflowWrap: 'anywhere' }
const codeStyle: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: '0.92em', color: 'var(--text-default)', background: 'var(--state-hover-bg)', borderRadius: 3, padding: '0 3px' }
const cellStyle: CSSProperties = { padding: '5px 10px 5px 0', textAlign: 'left', verticalAlign: 'top', borderBottom: '1px solid var(--border-row)', overflowWrap: 'anywhere' }
// Paragraphs are Inter Light: the UI font has nothing lighter than a heavy
// regular, which tires the eye over pages of licence text.
const paragraphFont: CSSProperties = { fontFamily: "'Inter', sans-serif", fontWeight: 300 }
const HEADING: Record<number, CSSProperties> = {
  1: { margin: '0 0 10px', fontSize: 17, fontWeight: 700, color: 'var(--text-default)' },
  2: { margin: '22px 0 8px', paddingBottom: 5, fontSize: 13, fontWeight: 700, color: 'var(--text-amber)', borderBottom: '1px solid var(--border-row)' },
  3: { margin: '16px 0 6px', fontSize: 12, fontWeight: 700, color: 'var(--text-default)' },
}

function Text({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((x, i) =>
        x.kind === 'bold' ? <strong key={i} style={{ fontWeight: 600 }}>{x.text}</strong>
        : x.kind === 'em' ? <em key={i}>{x.text}</em>
        : x.kind === 'code' ? <code key={i} style={codeStyle}>{x.text}</code>
        : x.kind === 'link' ? <button key={i} onClick={() => window.electronAPI.openExternal(x.url)} style={linkStyle}>{x.text}</button>
        : x.text)}
    </>
  )
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === 'heading') {
          const Tag = (b.level === 1 ? 'h1' : b.level === 2 ? 'h2' : 'h3') as 'h1' | 'h2' | 'h3'
          return <Tag key={i} style={HEADING[Math.min(b.level, 3)]}><Text text={b.text} /></Tag>
        }
        if (b.kind === 'para') return <p key={i} style={{ margin: '0 0 9px', ...paragraphFont }}><Text text={b.text} /></p>
        if (b.kind === 'rule') return <hr key={i} style={{ margin: '14px 0', border: 'none', borderTop: '1px solid var(--border-row)' }} />
        if (b.kind === 'code') {
          return <pre key={i} style={{ margin: '0 0 10px', padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--state-hover-bg)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>{b.text}</pre>
        }
        if (b.kind === 'details') {
          return (
            <details key={i} style={{ margin: '0 0 10px' }}>
              <summary style={{ cursor: 'pointer', color: 'var(--text-amber)', marginBottom: 6 }}>{b.summary}</summary>
              <Blocks blocks={b.blocks} />
            </details>
          )
        }
        return (
          <table key={i} style={{ width: '100%', margin: '0 0 12px', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead><tr>{b.head.map((h, j) => <th key={j} style={{ ...cellStyle, whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}><Text text={h} /></th>)}</tr></thead>
            <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} style={cellStyle}><Text text={c} /></td>)}</tr>)}</tbody>
          </table>
        )
      })}
    </>
  )
}

function LicensesWindow({ onClose }: { onClose: () => void }) {
  const [texts, setTexts] = useState<Texts | null | undefined>(undefined)
  const [tab, setTab] = useState<keyof Texts>('orfeo')
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, true)

  useEffect(() => { window.electronAPI.readLicenses().then(setTexts, () => setTexts(null)) }, [])
  const blocks = useMemo(() => texts ? parseLicenseMarkdown(texts[tab]) : [], [texts, tab])

  // Escape closes this window only, not the Settings window behind it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // ── Draggable by the title row — starts centred; once dragged, a fixed position
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const drag = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null)
  const startDrag = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const r = panelRef.current?.getBoundingClientRect()
    const from = pos ?? { x: r?.left ?? 0, y: r?.top ?? 0 }
    if (!pos) setPos(from)
    drag.current = { startX: e.clientX, startY: e.clientY, posX: from.x, posY: from.y }
  }
  const onDragMove = useCallback((e: MouseEvent) => {
    const d = drag.current
    if (!d) return
    // the top stays below the window's own title bar (40 px of Windows controls)
    setPos({ x: d.posX + (e.clientX - d.startX), y: Math.max(44, d.posY + (e.clientY - d.startY)) })
  }, [])
  const onDragEnd = useCallback(() => { drag.current = null }, [])
  useEffect(() => {
    window.addEventListener('mousemove', onDragMove)
    window.addEventListener('mouseup', onDragEnd)
    return () => { window.removeEventListener('mousemove', onDragMove); window.removeEventListener('mouseup', onDragEnd) }
  }, [onDragMove, onDragEnd])

  const tabs: { id: keyof Texts; name: string }[] = [
    { id: 'orfeo', name: t`Orfeo` },
    { id: 'thirdParty', name: t`Third-party` },
  ]

  return createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={t`Licenses`} className="orfeo-modal-glow app-no-drag"
        style={{ width: 'min(760px, 90vw)', height: 'min(640px, 85vh)', display: 'grid', gridTemplateRows: 'auto auto auto minmax(0, 1fr)',
          background: 'var(--bg-modal)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-lg)', padding: '16px 18px', fontFamily: 'var(--font-ui)',
          ...(pos ? { position: 'fixed', left: pos.x, top: pos.y } : {}) }}>
        <div onMouseDown={startDrag} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 12, cursor: 'grab' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-amber)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{t`Licenses`}</span>
          <button onClick={onClose} aria-label={t`Close`} style={modalCloseButtonStyle}><X size={14} /></button>
        </div>
        <p style={{ margin: '8px 0 10px', ...paragraphFont, fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--text-default)' }}>
          {t`Copyright © 2026 SquareBow. Orfeo is free software: you can share and change it under the GNU General Public License, version 3 or later, with an added permission for GSAP. It comes with no warranty.`}{' '}
          <button onClick={() => window.electronAPI.openExternal('https://github.com/Squarebow/Orfeo')} style={linkStyle}>{t`Source code`}</button>
        </p>
        <div role="tablist" aria-label={t`Licenses`} style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border2)' }}>
          {tabs.map(x => {
            const on = x.id === tab
            return (
              <button key={x.id} role="tab" aria-selected={on} onClick={() => setTab(x.id)}
                style={{ padding: '7px 14px', marginBottom: -1, background: 'none', border: 'none', cursor: 'pointer',
                  borderBottom: `2px solid ${on ? 'var(--text-amber)' : 'transparent'}`, color: on ? 'var(--text-amber)' : 'var(--text-inactive)',
                  fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-ui)' }}>
                {x.name}
              </button>
            )
          })}
        </div>
        <div key={tab} tabIndex={0} style={{ padding: '12px 8px 4px 0', overflowY: 'auto', fontSize: 12, lineHeight: 1.6, color: 'var(--text-default)', userSelect: 'text' }}>
          {texts === null ? t`The license files could not be read. You can find them with the source code.` : <Blocks blocks={blocks} />}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default function LicensesLink() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap' }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-amber)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}>
        {t`Licenses`}
      </button>
      {open && <LicensesWindow onClose={() => setOpen(false)} />}
    </>
  )
}
