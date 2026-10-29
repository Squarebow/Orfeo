// ── Hand colours — the user's left/right hand pair (Settings › Appearance).
// --hand-lh / --hand-rh in index.css hold Orfeo's defaults; applyHandColors()
// overrides them on the document root, so everything drawn with var() follows
// at once. Canvas code that needs literal hex (piano roll, hit effects, a
// piano track's starting colour) reads handHex() instead, and checks
// handPaletteVersion() to drop anything it cached. Amber (tools), the root
// accent and the compressor knob have their own tokens and never follow. ──
import { t } from './i18n'

export const DEFAULT_HAND_LH = '#6270A5'
export const DEFAULT_HAND_RH = '#CB636C'

export interface HandPreset { id: string; name: string; lh: string; rh: string }

// The three after Orfeo's own were checked with a colour-blindness simulation
// (Machado 2009, full severity; OKLab distance): the two hands stay apart, and
// both stay clear of amber, for normal vision and the three common kinds of
// colour blindness. (Orfeo's pair is weakest for red-blind eyes.)
export const HAND_PRESETS: HandPreset[] = [
  { id: 'orfeo', name: t`Orfeo`,          lh: DEFAULT_HAND_LH, rh: DEFAULT_HAND_RH },
  { id: 'bright', name: t`Bright`,        lh: '#4F8CFF', rh: '#FF5C8A' },
  { id: 'sky', name: t`Sky`,              lh: '#56B4E9', rh: '#D55E00' },  // sky blue & vermilion
  { id: 'mint', name: t`Mint`,            lh: '#5B5FD6', rh: '#4FC6A8' },  // indigo & mint
]

const HEX = /^#[0-9a-fA-F]{6}$/
export const isHex = (v: unknown): v is string => typeof v === 'string' && HEX.test(v)

let _lh = DEFAULT_HAND_LH
let _rh = DEFAULT_HAND_RH
let _version = 0

export function handHex(): { lh: string; rh: string } { return { lh: _lh, rh: _rh } }
export function handPaletteVersion(): number { return _version }

export function applyHandColors(lh: string, rh: string): void {
  if (!isHex(lh) || !isHex(rh)) return
  if (lh.toLowerCase() === _lh.toLowerCase() && rh.toLowerCase() === _rh.toLowerCase()) return
  _lh = lh
  _rh = rh
  _version++
  const root = document.documentElement.style
  const isDefault = lh.toLowerCase() === DEFAULT_HAND_LH.toLowerCase() && rh.toLowerCase() === DEFAULT_HAND_RH.toLowerCase()
  if (isDefault) { root.removeProperty('--hand-lh'); root.removeProperty('--hand-rh') }
  else { root.setProperty('--hand-lh', lh); root.setProperty('--hand-rh', rh) }
}

// ── Clash check — OKLab distance, as seen with normal vision ───────────────
function oklab(hex: string): [number, number, number] {
  const lin = (i: number) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const r = lin(1), g = lin(3), b = lin(5)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ]
}
const dist = (a: string, b: string) => { const A = oklab(a), B = oklab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]) }
// How different two hex colours look (OKLab distance; ~0.1 = clearly different)
export const colorDistance = dist
export const sameHex = (a: string | undefined, b: string | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

// ── A piano/organ track on a hand colour follows the user's pair: its
// current hand colour (prev) or Orfeo's default (also what older saved
// versions stored) maps to the new left/right colour; null = leave it ──────
export function followedHandColor(color: string, prev: { lh: string; rh: string }, next: { lh: string; rh: string }): string | null {
  if (sameHex(color, prev.lh) || sameHex(color, DEFAULT_HAND_LH)) return sameHex(color, next.lh) ? null : next.lh
  if (sameHex(color, prev.rh) || sameHex(color, DEFAULT_HAND_RH)) return sameHex(color, next.rh) ? null : next.rh
  return null
}

const AMBER = '#E8A027'
const TOO_ALIKE = 0.1      // Orfeo's own pair is 0.19 apart
const NEAR_AMBER = 0.08
const TOO_DARK = 0.38      // OKLab lightness; the background is ~0.15

export function handColorWarnings(lh: string, rh: string): string[] {
  if (!isHex(lh) || !isHex(rh)) return []
  const w: string[] = []
  if (dist(lh, rh) < TOO_ALIKE) w.push(t`The two hands look very alike — notes may be hard to tell apart.`)
  if (dist(lh, AMBER) < NEAR_AMBER || dist(rh, AMBER) < NEAR_AMBER) w.push(t`Close to Orfeo's amber, which marks the Explorers and lock-a-chord.`)
  if (oklab(lh)[0] < TOO_DARK || oklab(rh)[0] < TOO_DARK) w.push(t`Very dark — may be hard to see on the dark background.`)
  return w
}
