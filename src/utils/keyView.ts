import { useStore } from '../store'
import { rangeOf, viewOfRange, isPortableSize, foldIntoRange, type KeyView } from './keyLayout'
import type { KeyboardSize } from '../types'

// ── What the keyboard and the piano roll show, and how they get there ─────────
// The keys a keyboard size holds (its range, moved by the octave buttons for a
// portable size) are the TARGET. What is drawn is the store's keyView: when the
// target changes, the view glides there over GLIDE_MS — keys, lanes, grid and
// key height all follow the same view, so they scale as one. keyViewLo/Hi are
// the keys to draw meanwhile (both the old and the new range), so keys slide
// in and out at the edges instead of popping.

const GLIDE_MS = 260

export interface KeyRangeState { keyboardSize: KeyboardSize; keyboardOctave: number }

export function targetRange(s: KeyRangeState): { min: number; max: number } {
  return rangeOf(s.keyboardSize, isPortableSize(s.keyboardSize) ? s.keyboardOctave : 0)
}

// Notes past a portable keyboard's edges move onto it an octave at a time (and
// are drawn fainter). Standard sizes keep their keys exactly: null.
export function foldRange(s: KeyRangeState): { min: number; max: number } | null {
  return isPortableSize(s.keyboardSize) ? targetRange(s) : null
}

export { foldIntoRange }

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3)

let raf: number | null = null
let fromView: KeyView | null = null
let glideLo = 0, glideHi = 0
let startAt = 0
let lastTarget = ''

function settle(min: number, max: number) {
  useStore.setState({ keyView: viewOfRange(min, max), keyViewLo: min, keyViewHi: max })
}

function onTargetChange(): void {
  const s = useStore.getState()
  const { min, max } = targetRange(s)
  const key = `${min}-${max}`
  if (key === lastTarget) return
  const first = lastTarget === ''
  lastTarget = key
  const to = viewOfRange(min, max)
  const canAnimate = typeof requestAnimationFrame === 'function' && !first
  if (!canAnimate) { settle(min, max); return }

  // start from wherever the view is now (a glide may already be under way)
  fromView = { ...s.keyView }
  glideLo = Math.min(s.keyViewLo, min)
  glideHi = Math.max(s.keyViewHi, max)
  startAt = performance.now()
  if (raf !== null) cancelAnimationFrame(raf)
  const step = () => {
    const p = Math.min(1, (performance.now() - startAt) / GLIDE_MS)
    if (p >= 1 || !fromView) { raf = null; settle(min, max); return }
    const e = easeOutCubic(p)
    useStore.setState({
      keyView: { v0: fromView.v0 + (to.v0 - fromView.v0) * e, vw: fromView.vw + (to.vw - fromView.vw) * e },
      keyViewLo: glideLo, keyViewHi: glideHi,
    })
    raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
}

let started = false
// Called by the keyboard and the piano roll as they mount; once is enough.
export function startKeyView(): void {
  if (started) return
  started = true
  onTargetChange()
  useStore.subscribe((s, prev) => {
    if (s.keyboardSize !== prev.keyboardSize || s.keyboardOctave !== prev.keyboardOctave) onTargetChange()
  })
}

// ── Key height ───────────────────────────────────────────────────────────────
// Keys are 4 times as tall as they are wide, between 80 and 140 px, on every
// size. A portable keyboard's keys are wider but no taller than a full
// keyboard's (the user found 25 and 37 keys "enormous" when they grew).
export function keyHeightFor(containerWidth: number, view: KeyView, _windowHeight: number): number {
  const whiteW = containerWidth / view.vw
  return Math.round(Math.max(80, Math.min(140, whiteW * 4.0)))
}

// Labels on the keys grow a little on a smaller keyboard (1 = as before)
export function labelScaleFor(view: KeyView): number {
  return view.vw >= 36 ? 1 : Math.min(1.2, Math.sqrt(36 / view.vw))
}
