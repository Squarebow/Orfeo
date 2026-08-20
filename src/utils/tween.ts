// ── Minimal requestAnimationFrame-based property tweening ───────────────────
// Replaces GSAP, which was used only for this. GSAP's "Standard (no charge)"
// license is a custom proprietary license, not GPLv3-compatible — see the
// Versioning/licensing note in CLAUDE.md. This only implements what
// HitEffects.ts actually needs (numeric property tweening, an easing curve,
// delay, onUpdate/onComplete, kill()) — not a general animation library.

export type EaseName =
  | 'linear'
  | 'power1.in' | 'power1.out' | 'power1.inOut'
  | 'power2.in' | 'power2.out' | 'power2.inOut'
  | 'power3.in' | 'power3.out' | 'power3.inOut'
  | 'sine.in' | 'sine.out' | 'sine.inOut'

// Standard named easing curves (Robert Penner's equations, public-domain —
// independently implemented here, not GSAP's code). powerN uses exponent
// N+1 (power1 = quadratic, power2 = cubic, power3 = quartic), matching
// GSAP's own naming so effects tuned against it keep the same feel.
const EASES: Record<EaseName, (t: number) => number> = {
  linear: t => t,
  'power1.in': t => t ** 2,
  'power1.out': t => 1 - (1 - t) ** 2,
  'power1.inOut': t => (t < 0.5 ? 2 * t ** 2 : 1 - ((-2 * t + 2) ** 2) / 2),
  'power2.in': t => t ** 3,
  'power2.out': t => 1 - (1 - t) ** 3,
  'power2.inOut': t => (t < 0.5 ? 4 * t ** 3 : 1 - ((-2 * t + 2) ** 3) / 2),
  'power3.in': t => t ** 4,
  'power3.out': t => 1 - (1 - t) ** 4,
  'power3.inOut': t => (t < 0.5 ? 8 * t ** 4 : 1 - ((-2 * t + 2) ** 4) / 2),
  'sine.in': t => 1 - Math.cos((t * Math.PI) / 2),
  'sine.out': t => Math.sin((t * Math.PI) / 2),
  'sine.inOut': t => -(Math.cos(Math.PI * t) - 1) / 2,
}

export interface TweenHandle {
  kill(): void
}

interface TweenVars {
  duration: number
  ease?: EaseName
  delay?: number
  onUpdate?: () => void
  onComplete?: () => void
  [prop: string]: unknown
}

interface ActiveTween {
  target: Record<string, number>
  from: Record<string, number>
  to: Record<string, number>
  duration: number
  ease: (t: number) => number
  startAt: number
  onUpdate?: () => void
  onComplete?: () => void
  dead: boolean
}

// ── One shared rAF loop for every active tween — starting/stopping a
// requestAnimationFrame callback per-tween would be wasteful; this only
// runs the loop while at least one tween is active. ─────────────────────
const active = new Set<ActiveTween>()
let rafId: number | null = null

function loop(): void {
  const now = performance.now()
  for (const t of [...active]) {
    if (t.dead) continue
    if (now < t.startAt) continue
    const elapsed = (now - t.startAt) / 1000
    const p = t.duration <= 0 ? 1 : Math.min(1, elapsed / t.duration)
    const eased = t.ease(p)
    for (const key in t.to) t.target[key] = t.from[key] + (t.to[key] - t.from[key]) * eased
    t.onUpdate?.()
    if (p >= 1) {
      active.delete(t)
      t.onComplete?.()
    }
  }
  rafId = active.size > 0 ? requestAnimationFrame(loop) : null
}

// ── Animate numeric properties of `target` toward the values in `vars` —
// mirrors gsap.to()'s call shape closely enough to be a drop-in swap. ───────
export function tween<T extends Record<string, number>>(target: T, vars: TweenVars): TweenHandle {
  const { duration, ease = 'power1.out', delay = 0, onUpdate, onComplete, ...props } = vars
  const from: Record<string, number> = {}
  const to: Record<string, number> = {}
  for (const key in props) {
    const v = props[key]
    if (typeof v !== 'number') continue
    from[key] = target[key as keyof T] as number
    to[key] = v
  }
  const entry: ActiveTween = {
    target, from, to, duration,
    ease: EASES[ease] ?? EASES['power1.out'],
    startAt: performance.now() + delay * 1000,
    onUpdate, onComplete, dead: false,
  }
  active.add(entry)
  if (rafId === null) rafId = requestAnimationFrame(loop)
  return { kill: () => { entry.dead = true; active.delete(entry) } }
}
