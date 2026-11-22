import { create } from 'zustand'
import { useStore } from '../store'
import { sim, simAvailable } from '../utils/midiSimulator'
import { isTextEntry } from '../utils/keyTarget'
import { usePractice } from './practiceMode'
import { reviewing } from './reviewState'
import { expectedNotes, heardSongTime, onSongJump, useWaiting } from './listen'
import { rangeOf } from '../hooks/useMidiInput'
import { useMidiSettings } from '../store/midiSettings'
import type { Expected } from './matcher'

// ── Dev Tools for practice mode: playing without a USB keyboard ──────────────
// Everything goes through a simulated keyboard (Settings › Dev Tools ›
// Simulated keyboards), so Orfeo hears it exactly as it hears a real one:
// - clicking the on-screen keys, or the computer keyboard's two letter rows;
// - a virtual pianist who plays your part the way you ask: spot on, early,
//   late, wrong or missed notes, hesitating, rolled chords, one hand only.
// Session only, nothing saved; dev mode and test builds only.

export type PianistStyle = 'off' | 'spot' | 'early' | 'late' | 'wrong' | 'missed' | 'hesitate' | 'rolled' | 'oneHand'

interface DevPractice {
  keysPlay: boolean          // clicks and computer keys play the simulated keyboard
  listenPanel: boolean       // the listening panel shows in practice mode
  pianist: PianistStyle
  octave: number             // computer keys: the upper row starts at C of this octave
}
export const useDevPractice = create<DevPractice>(() => ({ keysPlay: false, listenPanel: false, pianist: 'off', octave: 4 }))

/** The simulated keyboard that's plugged in, if any */
export function pluggedSim(): string | null {
  return sim.models.find(m => sim.isPlugged(m.key))?.key ?? null
}
const playing = () => simAvailable && usePractice.getState().active && useDevPractice.getState().keysPlay

// ── Clicking the on-screen keys (Keyboard.tsx asks first) ────────────────────
const clicked = new Set<number>()
/** True when the click was taken as playing */
export function devClickKey(midi: number, glide = false): boolean {
  const key = pluggedSim()
  if (!playing() || !key) return false
  if (glide) { for (const n of clicked) sim.noteOff(key, n); clicked.clear() }
  if (!clicked.has(midi)) { sim.noteOn(key, midi, 90); clicked.add(midi) }
  return true
}
if (typeof window !== 'undefined') {
  window.addEventListener('mouseup', () => {
    const key = pluggedSim()
    if (key) for (const n of clicked) sim.noteOff(key, n)
    clicked.clear()
  })
}

// ── The computer keyboard: two rows, as in a tracker ─────────────────────────
// Upper row Q 2 W 3 E R 5 T 6 Y 7 U I 9 O 0 P (from C of the chosen octave),
// lower row Z S X D C V G B H N J M , L . (an octave lower). [ and ] move both
// an octave. By key position, so it works on any keyboard layout.
const UPPER = ['KeyQ', 'Digit2', 'KeyW', 'Digit3', 'KeyE', 'KeyR', 'Digit5', 'KeyT', 'Digit6', 'KeyY', 'Digit7', 'KeyU', 'KeyI', 'Digit9', 'KeyO', 'Digit0', 'KeyP']
const LOWER = ['KeyZ', 'KeyS', 'KeyX', 'KeyD', 'KeyC', 'KeyV', 'KeyG', 'KeyB', 'KeyH', 'KeyN', 'KeyJ', 'KeyM', 'Comma', 'KeyL', 'Period']
export function noteForCode(code: string, octave: number): number | null {
  const c = (octave + 1) * 12
  const u = UPPER.indexOf(code); if (u >= 0) return c + u
  const l = LOWER.indexOf(code); if (l >= 0) return c - 12 + l
  return null
}
const down = new Map<string, number>()
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', e => {
    if (!playing() || e.ctrlKey || e.altKey || e.metaKey || isTextEntry(e.target)) return
    if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
      useDevPractice.setState(s => ({ octave: Math.max(1, Math.min(7, s.octave + (e.code === 'BracketRight' ? 1 : -1))) }))
      e.preventDefault(); e.stopImmediatePropagation(); return
    }
    const n = noteForCode(e.code, useDevPractice.getState().octave)
    const key = pluggedSim()
    if (n === null || !key) return
    e.preventDefault(); e.stopImmediatePropagation()
    if (e.repeat || down.has(e.code)) return
    down.set(e.code, n); sim.noteOn(key, n, 90)
  }, true)
  window.addEventListener('keyup', e => {
    const n = down.get(e.code)
    if (n === undefined) return
    down.delete(e.code)
    const key = pluggedSim(); if (key) sim.noteOff(key, n)
    e.preventDefault(); e.stopImmediatePropagation()
  }, true)
  window.addEventListener('blur', () => { const key = pluggedSim(); if (key) for (const n of down.values()) sim.noteOff(key, n); down.clear() })
}

// ── The virtual pianist ──────────────────────────────────────────────────────
export interface Press { midi: number; time: number; dur: number; orig: number }   // orig: the note's own place

/** What the pianist plays for `expected`, in the song's seconds. `r` is the
 *  practice tempo against the song's (real-time amounts are stretched by it).
 *  Every choice is by note number, so a run is the same every time. */
export function pianistPlan(expected: Expected[], style: PianistStyle, r = 1): Press[] {
  if (style === 'off') return []
  const notes = [...expected].sort((a, b) => a.time - b.time || a.midi - b.midi)
  // chords: notes starting within 30 ms of each other
  const groups: Expected[][] = []
  for (const n of notes) {
    const g = groups[groups.length - 1]
    if (g && n.time - g[0].time < 0.03 * r) g.push(n); else groups.push([n])
  }
  const out: Press[] = []
  let late = 0
  groups.forEach((g, gi) => {
    if (style === 'hesitate' && gi > 0 && gi % 6 === 0) late = 0.6 * r     // stops to think before every 6th step…
    g.forEach((n, i) => {
      const k = gi * 8 + i
      if (style === 'missed' && k % 7 === 3) return
      if (style === 'oneHand' && n.hand === 'L') return
      let t = n.time + late
      if (style === 'early') t -= 0.08 * r
      if (style === 'late') t += 0.08 * r
      if (style === 'rolled' && g.length > 1) t += i * 0.035 * r
      const midi = style === 'wrong' && k % 7 === 3 ? n.midi + (k % 2 ? 1 : -1) : n.midi
      out.push({ midi, time: t, dur: Math.max(0.08 * r, (n.dur ?? 0.3) * 0.9), orig: n.time })
    })
    if (style === 'hesitate') late = 0                                   // …then plays on in time
  })
  return out.sort((a, b) => a.time - b.time)
}

let plan: Press[] = []
let next = 0
const fired = new Set<number>()   // plan entries already played
const timers = new Set<ReturnType<typeof setTimeout>>()
const ratio = () => { const s = useStore.getState(); return s.originalBpm > 0 ? s.bpm / s.originalBpm : 1 }

const sounding = new Map<number, string>()   // keys the pianist holds down, and on which keyboard
// Stop: nothing more to play, and every key the pianist holds let go
function cancelAll() {
  for (const t of timers) clearTimeout(t); timers.clear()
  for (const [n, key] of sounding) sim.noteOff(key, n)
  sounding.clear()
}
function restartPianist(from: number) {
  cancelAll()
  // only the keys the keyboard has: a real player can't press one it hasn't got
  const range = rangeOf(useMidiSettings.getState().activeDevice)
  const reach = expectedNotes().filter(e => !range || (e.midi >= range.low && e.midi <= range.high))
  plan = pianistPlan(reach, useDevPractice.getState().pianist, ratio())
  next = 0
  fired.clear()
  // from the notes written from here on (a late press of an earlier note isn't this take's)
  while (next < plan.length && plan[next].orig < from - 1e-6) next++
}

// The pianist's own sense of time: the song's, and while the song waits for
// it, its own, running on from where the song stopped
let anchor = { heard: 0, perf: 0 }
function pianistNow(): number {
  const r = ratio()
  if (useWaiting.getState().holding) return anchor.heard + (performance.now() - anchor.perf) / 1000 * r
  anchor = { heard: heardSongTime(), perf: performance.now() }
  return anchor.heard
}

function pianistTick() {
  const s = useStore.getState()
  const key = pluggedSim()
  const holding = useWaiting.getState().holding
  if (useDevPractice.getState().pianist !== 'off' && usePractice.getState().active && !reviewing() && (s.playbackState === 'playing' || holding) && key) {
    const r = ratio()
    const now = pianistNow()
    const heldAt = useWaiting.getState().at
    const fire = (i: number) => {
      const p = plan[i]
      fired.add(i)
      const wait = Math.max(0, (p.time - pianistNow()) / r * 1000)
      const on = setTimeout(() => {
        timers.delete(on)
        if (sounding.has(p.midi)) sim.noteOff(key, p.midi)   // the same key again: lift it first
        sim.noteOn(key, p.midi, 80); sounding.set(p.midi, key)
        const off = setTimeout(() => { timers.delete(off); sim.noteOff(key, p.midi); sounding.delete(p.midi) }, p.dur / r * 1000)
        timers.add(off)
      }, wait)
      timers.add(on)
    }
    if (holding && heldAt !== null) {
      // the song waits at a step: only that step's notes come, whenever they're due
      for (let i = next; i < plan.length && plan[i].time <= now + 0.15 * r; i++) {
        if (!fired.has(i) && Math.abs(plan[i].orig - heldAt) < 0.05) fire(i)
      }
    } else {
      while (next < plan.length && plan[next].time <= now + 0.15 * r) {
        if (!fired.has(next)) fire(next)
        next++
      }
    }
  }
  requestAnimationFrame(pianistTick)
}
if (typeof requestAnimationFrame === 'function' && simAvailable) {
  onSongJump(t => restartPianist(t))
  useDevPractice.subscribe((d, prev) => { if (d.pianist !== prev.pianist) restartPianist(useStore.getState().currentTime) })
  useStore.subscribe((s, prev) => { if (s.bpm !== prev.bpm) restartPianist(s.currentTime) })
  useStore.subscribe((s, prev) => { if (s.playbackState !== 'playing' && prev.playbackState === 'playing' && !useWaiting.getState().holding) { cancelAll(); restartPianist(s.currentTime) } })
  requestAnimationFrame(pianistTick)
}
