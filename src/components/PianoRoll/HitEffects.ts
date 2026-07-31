import { Container, Graphics, BlurFilter } from 'pixi.js'
import { AdvancedBloomFilter } from 'pixi-filters'
import gsap from 'gsap'
import type { HitEffectPattern } from '../../types'

export type { HitEffectPattern }

// ── Note-hit visual effects (Phase 2) — additive layer over the falling
// notes, spawned from the same lightKey() trigger as the key glow (see
// utils/hitEffectQueue.ts) so timing can never drift from audio.
//
// GSAP drives every effect's easing/lifecycle via its own ticker — each
// spawn creates one tween (or one per particle/wisp) with an onUpdate that
// redraws the Graphics from the tween's live values, and an onComplete that
// destroys the Graphics and removes it from the stage. No manual per-frame
// polling needed from PianoRoll.

const GRAVITY_PX_PER_S2 = 220

// ── Small color helpers — hex int <-> HSL, for the color-shifting effects.
// PixiJS colors are plain 0xRRGGBB ints; GSAP has no built-in hue rotation,
// so shifting a color over an effect's lifetime means converting once at
// spawn and re-deriving the hex value each frame from an interpolated hue.
function hexToHsl(hex: number): { h: number; s: number; l: number } {
  const r = ((hex >> 16) & 0xff) / 255, g = ((hex >> 8) & 0xff) / 255, b = (hex & 0xff) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  const d = max - min
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0))
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  return { h, s, l }
}

function hslToHex(h: number, s: number, l: number): number {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x } else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x } else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c } else { r = c; b = x }
  const R = Math.round((r + m) * 255), G = Math.round((g + m) * 255), B = Math.round((b + m) * 255)
  return (R << 16) | (G << 8) | B
}

export interface BloomParams {
  threshold: number  // 0-1 — how bright a pixel must be before it blooms
  intensity: number  // bloomScale — glow strength
  spread: number     // blur — halo radius
}

export class HitEffectsRenderer {
  private container: Container
  private activeTweens: gsap.core.Tween[] = []
  private bloom: AdvancedBloomFilter

  constructor(stage: Container) {
    this.container = new Container()
    // ── Real bloom (pixi-filters' AdvancedBloomFilter — luminance-threshold
    // extract, blur, additive composite), applied once to the whole effects
    // container rather than per-effect-instance. Same technique three.js's
    // UnrealBloomPass uses; this gets most of that visual quality without a
    // second WebGL rendering pipeline. Official PixiJS-team package, direct
    // v8 peer-dep compat — see chat for the research behind this choice.
    this.bloom = new AdvancedBloomFilter({ threshold: 0.4, bloomScale: 1.5, blur: 4 })
    this.container.filters = [this.bloom]
    stage.addChild(this.container)
  }

  setBloomParams(params: BloomParams): void {
    this.bloom.threshold = params.threshold
    this.bloom.bloomScale = params.intensity
    this.bloom.blur = params.spread
  }

  private track(tw: gsap.core.Tween): void {
    this.activeTweens.push(tw)
  }

  private untrack(tw: gsap.core.Tween): void {
    const i = this.activeTweens.indexOf(tw)
    if (i >= 0) this.activeTweens.splice(i, 1)
  }

  spawn(pattern: HitEffectPattern, x: number, y: number, color: number): void {
    switch (pattern) {
      case 'glowBloom':   return this.spawnGlowBloom(x, y, color)
      case 'rippleRing':  return this.spawnRippleRing(x, y, color)
      case 'particleBurst': return this.spawnParticleBurst(x, y, color)
      case 'smokePlume':  return this.spawnSmokePlume(x, y, color)
      case 'colorAura':   return this.spawnColorAura(x, y, color)
      case 'starburstNova': return this.spawnStarburstNova(x, y, color)
      case 'cometTrail':  return this.spawnCometTrail(x, y, color)
    }
  }

  // ── Two-layer additive bloom: soft wide halo + brighter, faster-decaying core.
  private spawnGlowBloom(x: number, y: number, color: number): void {
    const g = new Graphics()
    g.x = x; g.y = y
    g.blendMode = 'add'
    this.container.addChild(g)
    const state = { haloR: 6, haloA: 0.55, coreR: 3, coreA: 1 }
    const tw = gsap.to(state, {
      haloR: 48, haloA: 0, coreR: 16, coreA: 0,
      duration: 0.4, ease: 'power2.out',
      onUpdate: () => {
        g.clear()
        g.circle(0, 0, state.haloR); g.fill({ color, alpha: state.haloA })
        g.circle(0, 0, state.coreR); g.fill({ color: 0xffffff, alpha: state.coreA * 0.85 })
        g.circle(0, 0, state.coreR); g.fill({ color, alpha: state.coreA })
      },
      onComplete: () => { g.destroy(); this.untrack(tw) },
    })
    this.track(tw)
  }

  // ── Three staggered concentric rings, additive.
  private spawnRippleRing(x: number, y: number, color: number): void {
    const RING_COUNT = 3
    for (let i = 0; i < RING_COUNT; i++) {
      const g = new Graphics()
      g.x = x; g.y = y
      g.blendMode = 'add'
      this.container.addChild(g)
      const state = { radius: 4, alpha: 0.85, width: 3 }
      const tw = gsap.to(state, {
        radius: 30 + i * 12, alpha: 0, width: 0.5,
        duration: 0.45, ease: 'power1.out', delay: i * 0.08,
        onUpdate: () => {
          g.clear()
          g.circle(0, 0, state.radius)
          g.stroke({ width: state.width, color, alpha: state.alpha })
        },
        onComplete: () => { g.destroy(); this.untrack(tw) },
      })
      this.track(tw)
    }
  }

  // ── 4-8 particles, upward-biased spread, hand-integrated gravity (GSAP has
  // no free physics plugin — a few lines per frame isn't worth a dependency).
  private spawnParticleBurst(x: number, y: number, color: number): void {
    const count = 4 + Math.floor(Math.random() * 5)
    for (let i = 0; i < count; i++) {
      const size = 2 + Math.random()
      const g = new Graphics()
      g.rect(-size / 2, -size / 2, size, size)
      g.fill({ color, alpha: 1 })
      g.x = x; g.y = y
      g.blendMode = 'add'
      this.container.addChild(g)

      const angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI * 0.7)
      const speed = 50 + Math.random() * 70
      const state = { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, alpha: 1 }
      let lastMs = performance.now()

      const tw = gsap.to(state, {
        alpha: 0, duration: 0.4 + Math.random() * 0.1, ease: 'power1.in',
        onUpdate: () => {
          const now = performance.now()
          const dt = (now - lastMs) / 1000
          lastMs = now
          state.vy += GRAVITY_PX_PER_S2 * dt
          g.x += state.vx * dt
          g.y += state.vy * dt
          g.alpha = state.alpha
        },
        onComplete: () => { g.destroy(); this.untrack(tw) },
      })
      this.track(tw)
    }
  }

  // ── Soft blurred wisps drifting upward, hue-shifting as they rise and
  // dissipate — the actual "smoke/fog" ask. BlurFilter is what makes these
  // read as soft/hazy instead of a crisp vector circle.
  private spawnSmokePlume(x: number, y: number, color: number): void {
    const base = hexToHsl(color)
    const wisps = 3
    for (let i = 0; i < wisps; i++) {
      const g = new Graphics()
      g.filters = [new BlurFilter({ strength: 6 + Math.random() * 4 })]
      g.x = x + (Math.random() - 0.5) * 10
      g.y = y
      this.container.addChild(g)

      const driftTargetX = g.x + (Math.random() - 0.5) * 24
      const state = { r: 6 + Math.random() * 3, alpha: 0.5, hueShift: 0, x: g.x, riseY: 0 }
      const tw = gsap.to(state, {
        r: 26 + Math.random() * 10, alpha: 0, hueShift: 30 + Math.random() * 30,
        x: driftTargetX, riseY: -(30 + Math.random() * 15),
        duration: 0.75 + Math.random() * 0.25, ease: 'sine.out', delay: i * 0.06,
        onUpdate: () => {
          const hex = hslToHex(base.h + state.hueShift, base.s, Math.min(0.85, base.l + 0.15))
          g.clear()
          g.circle(0, 0, state.r)
          g.fill({ color: hex, alpha: state.alpha })
          g.x = state.x
          g.y = y + state.riseY
        },
        onComplete: () => { g.destroy(); this.untrack(tw) },
      })
      this.track(tw)
    }
  }

  // ── Single soft blurred blob that gently pulses and cycles color across a
  // hue range — "changing colors" as its own dedicated effect.
  private spawnColorAura(x: number, y: number, color: number): void {
    const base = hexToHsl(color)
    const g = new Graphics()
    g.filters = [new BlurFilter({ strength: 10 })]
    g.x = x; g.y = y
    this.container.addChild(g)
    const state = { r: 10, alpha: 0.7, hue: 0 }
    const tw = gsap.to(state, {
      r: 34, alpha: 0, hue: 140,
      duration: 0.65, ease: 'sine.inOut',
      onUpdate: () => {
        const hex = hslToHex(base.h + state.hue, Math.min(1, base.s + 0.2), base.l)
        g.clear()
        g.circle(0, 0, state.r)
        g.fill({ color: hex, alpha: state.alpha })
      },
      onComplete: () => { g.destroy(); this.untrack(tw) },
    })
    this.track(tw)
  }

  // ── Sharp radiating rays + a bright flash core, additive — the "explosive"
  // counterpart to the soft smoke/glow effects.
  private spawnStarburstNova(x: number, y: number, color: number): void {
    const rayCount = 8
    const g = new Graphics()
    g.x = x; g.y = y
    g.blendMode = 'add'
    this.container.addChild(g)
    const state = { length: 4, alpha: 0.9, coreR: 10, coreA: 1 }
    const tw = gsap.to(state, {
      length: 34, alpha: 0, coreR: 2, coreA: 0,
      duration: 0.32, ease: 'power3.out',
      onUpdate: () => {
        g.clear()
        for (let i = 0; i < rayCount; i++) {
          const angle = (i / rayCount) * Math.PI * 2
          const x2 = Math.cos(angle) * state.length
          const y2 = Math.sin(angle) * state.length
          g.moveTo(0, 0).lineTo(x2, y2)
          g.stroke({ width: 2, color, alpha: state.alpha })
        }
        g.circle(0, 0, state.coreR)
        g.fill({ color: 0xffffff, alpha: state.coreA })
      },
      onComplete: () => { g.destroy(); this.untrack(tw) },
    })
    this.track(tw)
  }

  // ── Bright head shooting upward fast with a fading multi-segment trail.
  private spawnCometTrail(x: number, y: number, color: number): void {
    const g = new Graphics()
    g.x = x; g.y = y
    g.blendMode = 'add'
    this.container.addChild(g)
    const TRAIL_LEN = 6
    const history: { y: number }[] = Array.from({ length: TRAIL_LEN }, () => ({ y: 0 }))
    const state = { travel: 0, alpha: 1 }
    const tw = gsap.to(state, {
      travel: 70, alpha: 0, duration: 0.5, ease: 'power1.in',
      onUpdate: () => {
        history.pop()
        history.unshift({ y: -state.travel })
        g.clear()
        for (let i = 0; i < history.length; i++) {
          const t = 1 - i / history.length
          g.circle(0, history[i].y, 4 * t)
          g.fill({ color, alpha: state.alpha * t })
        }
        g.circle(0, -state.travel, 3)
        g.fill({ color: 0xffffff, alpha: state.alpha })
      },
      onComplete: () => { g.destroy(); this.untrack(tw) },
    })
    this.track(tw)
  }

  destroy(): void {
    this.activeTweens.forEach(tw => tw.kill())
    this.activeTweens = []
    this.container.destroy({ children: true })
  }
}
