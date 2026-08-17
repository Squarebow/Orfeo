import { useRef, useState, useEffect, useMemo, useCallback, type CSSProperties } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../../store'
import { bringToFront, MODAL_BASE_Z } from '../../utils/modalFocus'
import ChannelStrip from './ChannelStrip'
import MasterStrip from './MasterStrip'
import OrfeoMark from '../OrfeoMark'
import { getPianoRollCenterX, getKeyboardHeaderTop } from '../../utils/modalAnchors'
import { modalCloseButtonStyle, modalCloseButtonHoverColor, modalCloseButtonIdleColor } from '../../utils/modalCloseButtonStyle'
import { confirmDialog } from '../../utils/confirmController'
import { parseMidiBuffer } from '../../utils/midiParser'
import { detectKeyFromTracks, parseKeySignature } from '../../utils/keyDetection'
import { KEYBOARD_GROUPS } from '../../utils/keyboardGroups'
import { useFocusTrap } from '../../hooks/useFocusTrap'

// ── MixerConsole — floating draggable modal ───────────────────────────────────
// Opened via Ctrl+Shift+M or the Console (SlidersVertical) icon in the TrackPanel.
// Width locked to show exactly 8 channel strips + master.

// ── Modal dimensions — derived from strip geometry ────────────────────────────
// n strips × 120px + (n−1) inter-strip gaps × 8px + body-gap 8px + master 160px + padding 2×16px
const STRIP_W   = 120
const STRIP_GAP = 8
const MASTER_W  = 184
const BODY_PAD  = 16
const MAX_STRIPS = 8

// ── Track sort order — matches TrackPanel GROUP_ORDER ────────────────────────
const GROUP_ORDER = [
  'piano', 'chromatic', 'organ', 'guitar', 'bass',
  'strings', 'ensemble', 'brass', 'reed', 'pipe',
  'synth_lead', 'synth_pad', 'synth_fx', 'ethnic',
  'percussive', 'sfx', 'drums',
]

const MODAL_H_APPROX = 650  // header 40 + body-pad 16*2 + strip 574 + scrollbar ~4

// ── MixerConsole ──────────────────────────────────────────────────────────────
export default function MixerConsole() {
  const mixerOpen       = useStore(s => s.mixerOpen)
  const setMixerOpen    = useStore(s => s.setMixerOpen)
  // ── Lightweight track identity/order signature — NOT the live `tracks`
  // array. Grouping/ordering below only needs `index` + `group`, but every
  // fader/knob drag replaces the whole `tracks` array (new reference) many
  // times a second; subscribing to it directly forced this whole console —
  // all 8 channel strips + master — to re-render on every tick of ANY drag,
  // which is what made playback stutter while dragging. A joined string is
  // value-equal (`===`) across renders whenever index/group haven't
  // actually changed, so zustand's default Object.is check bails out for
  // volume/pan/chorus/reverb-only updates. ──────────────────────────────────
  const trackSignature = useStore(s => s.tracks.map(t => `${t.index}:${t.group ?? ''}`).join('|'))
  const trackMeta = useMemo(
    () => useStore.getState().tracks.map(t => ({ index: t.index, group: t.group })),
    [trackSignature],
  )

  // ── Mount guard — don't render until first open ───────────────────────────
  // everOpened keeps the component mounted after first open so all internal state
  // (pos, knob values, scroll) survives hide/show cycles.
  const [everOpened, setEverOpened] = useState(false)
  const positioned = useRef(false)

  // ── Mark ever-opened on first open; also finalize position then, using the
  // real track count — the mount-time initializer below runs before any file
  // is loaded (0 tracks), so its width guess was never right once a real
  // file's tracks were in. ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mixerOpen) return
    setEverOpened(true)
    if (positioned.current) return
    positioned.current = true
    const n = Math.min(Math.max(useStore.getState().tracks.length, 1), MAX_STRIPS)
    const w = BODY_PAD * 2 + n * STRIP_W + (n - 1) * STRIP_GAP + STRIP_GAP + MASTER_W + 2
    setPos({
      x: Math.round(getPianoRollCenterX() - w / 2),
      y: Math.round(getKeyboardHeaderTop() - MODAL_H_APPROX) - 11,
    })
  }, [mixerOpen])

  // ── Close — diffs live channel values against the file-load baseline; if any
  // channel's volume/pan/reverb/chorus changed, offers to save before closing.
  // Save writes a new _ORFEO_vN file (same versioning as editor:save) and
  // switches the app to it; Discard drops the changes; Cancel keeps the mixer
  // open. Nothing to diff (Master strip, mute/solo/etc.) — those stay session-only. ──
  const requestClose = useCallback(async () => {
    const { tracks: liveTracks, mixerBaseline, midi } = useStore.getState()
    const changed = liveTracks.filter(t => {
      const base = mixerBaseline[t.index]
      return base && (base.volume !== t.volume || base.pan !== t.pan || base.chorus !== t.chorus || base.reverb !== t.reverb)
    })
    if (changed.length === 0 || !midi) { setMixerOpen(false); return }

    const filePath = (midi as any)._filePath ?? ''
    const choice = await confirmDialog({
      title: 'Save mixer changes?',
      message: `Volume, pan, reverb, and chorus were changed for ${changed.length} channel(s).`,
      buttons: ['Save', 'Discard', 'Cancel'],
    })
    if (choice === 2) return // Cancel — leave mixer open
    if (choice === 1) { setMixerOpen(false); return } // Discard — re-seeded from file next open

    try {
      const result = await window.electronAPI.saveMixerChannels({
        filePath,
        channels: changed.map(t => ({ index: t.index, volume: t.volume, pan: t.pan, chorus: t.chorus, reverb: t.reverb })),
      })
      if (!result.ok || !result.base64 || !result.fileName || !result.filePath) {
        await confirmDialog({ title: 'Save failed', message: result.message ?? 'Could not save mixer changes.', buttons: ['OK'] })
        return // leave mixer open so the user can retry
      }
      const binary = atob(result.base64)
      const bytes  = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const parsed = parseMidiBuffer(bytes.buffer, result.fileName, result.filePath)
      useStore.getState().setMidi(parsed)
      const raw = parsed as any
      useStore.getState().setDetectedKey(
        raw._keySignature ? parseKeySignature(raw._keySignature.key, raw._keySignature.scale) : detectKeyFromTracks(parsed.tracks),
      )
      ;(useStore.getState() as any).setLibraryNeedsRefresh?.(true)
      setMixerOpen(false)
    } catch (e: any) {
      await confirmDialog({ title: 'Save failed', message: e?.message ?? 'Could not save mixer changes.', buttons: ['OK'] })
    }
  }, [setMixerOpen])

  // ── Drag-to-reorder — session-only display order, never written to the file.
  // Piano/keys always stays pinned first — group drag is simply disabled for
  // it, same pattern as TrackPanel.tsx's group drag-reorder. ──────────────────
  const [customChannelOrder, setCustomChannelOrder] = useState<number[] | null>(null)
  const [draggedChannel, setDraggedChannel] = useState<number | null>(null)

  // ── Locked (piano/keys) — always first, in GROUP_ORDER/index order, never
  // draggable. Reorderable — everything else, defaulting to GROUP_ORDER/index,
  // overridden by customChannelOrder once the user drags a strip. ─────────────
  const lockedTracks = useMemo(() =>
    trackMeta.filter(t => KEYBOARD_GROUPS.has(t.group ?? '')).sort((a, b) => a.index - b.index),
  [trackMeta])

  const reorderableBase = useMemo(() =>
    trackMeta.filter(t => !KEYBOARD_GROUPS.has(t.group ?? '')).sort((a, b) => {
      const ai = GROUP_ORDER.indexOf(a.group ?? '')
      const bi = GROUP_ORDER.indexOf(b.group ?? '')
      const ao = ai === -1 ? GROUP_ORDER.length : ai
      const bo = bi === -1 ? GROUP_ORDER.length : bi
      return ao !== bo ? ao - bo : a.index - b.index
    }),
  [trackMeta])

  const reorderableTracks = useMemo(() => {
    if (!customChannelOrder) return reorderableBase
    return [
      ...customChannelOrder.map(idx => reorderableBase.find(t => t.index === idx)).filter((t): t is typeof reorderableBase[number] => !!t),
      ...reorderableBase.filter(t => !customChannelOrder.includes(t.index)),
    ]
  }, [reorderableBase, customChannelOrder])

  const sortedTracks = useMemo(() => [...lockedTracks, ...reorderableTracks], [lockedTracks, reorderableTracks])

  // ── Channel drag-to-reorder — piano/keys is never draggable and never a
  // valid drop target's displacement (excluded from the reorderable list
  // entirely, so nothing can end up ahead of it). ─────────────────────────────
  const reorderChannels = (draggedIndex: number, targetIndex: number) => {
    if (draggedIndex === targetIndex) return
    const draggedTrack = trackMeta.find(t => t.index === draggedIndex)
    const targetTrack = trackMeta.find(t => t.index === targetIndex)
    if (!draggedTrack || !targetTrack) return
    if (KEYBOARD_GROUPS.has(draggedTrack.group ?? '') || KEYBOARD_GROUPS.has(targetTrack.group ?? '')) return
    const base = customChannelOrder ?? reorderableBase.map(t => t.index)
    // ── Direction-aware insert — see TrackPanel.tsx's reorderTracks for the
    // full explanation: inserting at a flat `without.indexOf(target)` only
    // lands right when dragging upward; downward drops land one slot short
    // (just above the target instead of below it) without the +1. ──────────
    const movingDown = base.indexOf(targetIndex) > base.indexOf(draggedIndex)
    const without = base.filter(i => i !== draggedIndex)
    const targetIdx = without.indexOf(targetIndex) + (movingDown ? 1 : 0)
    without.splice(targetIdx, 0, draggedIndex)
    setCustomChannelOrder(without)
  }

  // ── Modal width — adapts to track count, capped at MAX_STRIPS ────────────
  const modalW = useMemo(() => {
    const n = Math.min(Math.max(sortedTracks.length, 1), MAX_STRIPS)
    // +2 accounts for 1px left + 1px right border (border-box sizing)
    return BODY_PAD * 2 + n * STRIP_W + (n - 1) * STRIP_GAP + STRIP_GAP + MASTER_W + 2
  }, [sortedTracks.length])

  // ── Drag position — bottom edge on the keyboard header, horizontally
  // centered on the piano roll; set once on first render. ───────────────────
  const [pos, setPos] = useState(() => {
    const n = Math.min(Math.max(useStore.getState().tracks.length, 1), MAX_STRIPS)
    const w = BODY_PAD * 2 + n * STRIP_W + (n - 1) * STRIP_GAP + STRIP_GAP + MASTER_W + 2
    return {
      x: Math.max(0, Math.round(getPianoRollCenterX() - w / 2)),
      y: Math.max(0, Math.round(getKeyboardHeaderTop() - MODAL_H_APPROX) - 11),
    }
  })

  // ── Z-index — bringToFront on mousedown so last-clicked modal is on top ────
  const [zIndex, setZIndex] = useState(MODAL_BASE_Z)

  // ── Modal semantics — focus trap while open, restores focus on close ──────
  const modalRef = useRef<HTMLDivElement>(null)
  useFocusTrap(modalRef, mixerOpen && everOpened)

  // ── Header description marquee — the description only needs to scroll when
  // a narrow modal (few tracks loaded → fewer strips → less header width)
  // can't fit the full sentence. Measured against the live layout rather than
  // assumed, since strip count changes at runtime. 0 = fits, no marquee. ────
  const headerDescWrapRef = useRef<HTMLDivElement>(null)
  const headerDescRef     = useRef<HTMLSpanElement>(null)
  const [headerDescOverflow, setHeaderDescOverflow] = useState(0)
  useEffect(() => {
    const wrap = headerDescWrapRef.current, text = headerDescRef.current
    if (!wrap || !text) return
    const measure = () => setHeaderDescOverflow(Math.max(0, text.scrollWidth - wrap.clientWidth))
    measure()
    // Self-hosted fonts load async — an initial measure can run against
    // fallback-font metrics before JetBrains Mono swaps in, under-reporting
    // the text's real width. Re-measure once fonts settle to catch that.
    document.fonts?.ready?.then(measure)
    // Observe the TEXT, not just the wrap: overflow:hidden means the text's
    // own width changing (font swap, content edits) never changes the wrap's
    // clientWidth, so a wrap-only observer would never refire for it.
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    ro.observe(text)
    return () => ro.disconnect()
    // everOpened, not mixerOpen: the component returns null until everOpened
    // flips true (see line ~299), so the render where mixerOpen first goes
    // true has no DOM yet — refs are null and this bails out silently. By
    // the time mixerOpen is stable, this effect's old dependency never
    // reran, so headerDescOverflow stayed stuck at its initial 0 forever.
  }, [everOpened])

  // ── Drag-to-pan state for the channel strip row ───────────────────────────
  const scrollRef    = useRef<HTMLDivElement>(null)
  const dragStartX   = useRef(0)
  const dragStartSL  = useRef(0)
  const [panning, setPanning] = useState(false)

  // ── Document-level move/up for strip-row pan drag ─────────────────────────
  useEffect(() => {
    if (!panning) return
    const onMove = (e: MouseEvent) => {
      if (!scrollRef.current) return
      scrollRef.current.scrollLeft = dragStartSL.current + (dragStartX.current - e.clientX)
    }
    const onUp = () => setPanning(false)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
  }, [panning])

  // ── Start strip-row pan drag ──────────────────────────────────────────────
  const handleScrollMouseDown = useCallback((e: React.MouseEvent) => {
    if (!scrollRef.current) return
    dragStartX.current  = e.clientX
    dragStartSL.current = scrollRef.current.scrollLeft
    setPanning(true)
  }, [])

  // ── Horizontal scroll via vertical wheel on strip row ────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!scrollRef.current) return
    e.preventDefault()
    scrollRef.current.scrollLeft += e.deltaY
  }, [])

  // ── Header drag — moves the whole modal ──────────────────────────────────
  const startDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    const sx = e.clientX, sy = e.clientY
    const spx = pos.x, spy = pos.y
    const onMove = (ev: MouseEvent) =>
      // 44, not 0 — keeps the top edge clear of the 40px titleBarOverlay
      // (electron/main.ts) where Windows draws its own window controls on
      // top of everything in the DOM.
      setPos({ x: Math.max(0, spx + ev.clientX - sx), y: Math.max(44, spy + ev.clientY - sy) })
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
  }

  // ── Close on Escape ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!mixerOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mixerOpen, requestClose])

  // ── Do not mount until first open ────────────────────────────────────────
  if (!everOpened) return null

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-label="Console Mixer"
      className="orfeo-modal-glow"
      onMouseDown={() => setZIndex(bringToFront())}
      style={{
        position: 'fixed',
        left: pos.x, top: pos.y,
        width: modalW,
        // ── Viewport width cap — at high channel counts (8 strips ≈1218px)
        // the computed width can exceed the app's documented 900px minimum
        // window width and render clipped off-window. The channel strip row
        // below is flex:1/minWidth:0/overflowX:auto, so once the modal
        // itself is capped, that row becomes the sole overflow mechanism
        // (internal horizontal scroll) instead of the whole modal. calc()
        // tracks live window resizes with no JS listener needed. ───────────
        maxWidth: 'calc(100vw - 24px)',
        background: 'var(--bg-modal)',
        border: '1px solid var(--border2)',
        borderRadius: 10,
        display: mixerOpen ? 'flex' : 'none',
        flexDirection: 'column',
        overflow: 'hidden',
        userSelect: 'none',
        zIndex,
        '--_modal-shadow': 'var(--elevation-modal)',
      } as CSSProperties}
    >

      {/* ── Header — drag handle ─────────────────────────────────────────── */}
      <div
        onMouseDown={startDrag}
        style={{
          height: 36, flexShrink: 0,
          background: 'var(--bg-modal-header)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center',
          padding: '0 var(--space-3)',
          cursor: 'grab',
        }}
      >
        {/* ── Logo mark ──────────────────────────────────────────────────── */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', marginRight: 10 }}>
          <OrfeoMark height={22} />
        </div>

        {/* ── Title ──────────────────────────────────────────────────────── */}
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700,
          color: 'var(--text-amber)', letterSpacing: '0.14em', textTransform: 'uppercase',
          flexShrink: 0,
        }}>
          Console Mixer
        </span>

        {/* ── Permanent description — centered in whatever space is left between
            the title and the close button, not a hover tooltip (this one's
            always visible). When a narrow modal (few tracks) can't fit the
            full sentence, it marquee-scrolls on hover instead of ellipsis-
            truncating; when it fits, it just sits centered and static. ──── */}
        <div
          ref={headerDescWrapRef}
          className="orfeo-marquee-track"
          style={{
            flex: 1, minWidth: 0, overflow: 'hidden',
            display: 'flex', justifyContent: headerDescOverflow > 0 ? 'flex-start' : 'center',
            padding: '0 var(--space-3)',
          }}
        >
          <span
            ref={headerDescRef}
            className={headerDescOverflow > 0 ? 'orfeo-marquee-text is-overflowing' : 'orfeo-marquee-text'}
            style={{
              fontFamily: 'var(--font-ui)', fontSize: 11,
              color: 'var(--text-muted)', whiteSpace: 'nowrap',
              ...(headerDescOverflow > 0 ? { '--marquee-distance': `-${headerDescOverflow}px` } as CSSProperties : {}),
            }}
          >
            Adjust track levels, apply effects and compress overall loudness
          </span>
        </div>

        {/* ── Close button — bottom-aligned so the dash sits at X level ─────── */}
        <div
          style={{ display: 'flex', alignItems: 'flex-end', gap: 2, paddingBottom: 2 }}
          onMouseDown={e => e.stopPropagation()}
        >
          <button
            onClick={requestClose}
            title="Close"
            style={modalCloseButtonStyle}
            onMouseEnter={e => e.currentTarget.style.color = modalCloseButtonHoverColor}
            onMouseLeave={e => e.currentTarget.style.color = modalCloseButtonIdleColor}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: STRIP_GAP,
        padding: BODY_PAD,
        alignItems: 'flex-start',
      }}>

        {/* ── Scrollable channel strip row ────────────────────────────────── */}
        <div
          ref={scrollRef}
          className="mixer-scroll"
          onMouseDown={handleScrollMouseDown}
          onWheel={handleWheel}
          style={{
            flex: 1, minWidth: 0,
            display: 'flex', gap: STRIP_GAP,
            overflowX: 'auto',
            paddingBottom: 8,
            cursor: panning ? 'grabbing' : 'grab',
          }}
        >
          {sortedTracks.length === 0 ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: 574, flex: 1,
              color: 'var(--text-dimmest)', fontSize: 12, fontFamily: 'var(--font-mono)',
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              No tracks — load a MIDI file
            </div>
          ) : (
            sortedTracks.map(t => {
              const locked = KEYBOARD_GROUPS.has(t.group ?? '')
              return (
                <ChannelStrip
                  key={t.index}
                  trackIndex={t.index}
                  locked={locked}
                  isDragging={draggedChannel === t.index}
                  onDragStart={() => setDraggedChannel(t.index)}
                  onDragEnd={() => setDraggedChannel(null)}
                  onDrop={() => { if (draggedChannel !== null) reorderChannels(draggedChannel, t.index); setDraggedChannel(null) }}
                />
              )
            })
          )}
        </div>

        {/* ── Master strip — always visible, never scrolls ────────────────── */}
        <div style={{ flexShrink: 0 }}>
          <MasterStrip />
        </div>

      </div>
    </div>
  )
}
