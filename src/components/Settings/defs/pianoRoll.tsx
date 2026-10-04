import type { CSSProperties } from 'react'
import { ZoomIn, Grid3x3, Minus, Sparkles, ToggleLeft, ToggleRight, Undo2 } from 'lucide-react'
import { useStore } from '../../../store'
import type { HitEffectPattern } from '../../../types'
import Tooltip from '../../Tooltip'
import { Switch, RollZoomStepper, GlanceLine, SubLabel, HelpText, HitEffectColorSwatch, SettingsDropdown } from '../controls'
import type { SettingDef } from '../types'

export const HIT_EFFECT_DESCRIPTIONS: Record<HitEffectPattern, string> = {
  glowBloom: 'Soft radial glow that blooms outward and fades.',
  rippleRing: 'Expanding concentric rings, like a ripple in water.',
  particleBurst: 'Small particles spray upward and fall back down with gravity.',
  smokePlume: 'Soft blurred smoke wisps drift upward, shifting color as they dissipate.',
  colorAura: 'A soft glowing blob that pulses outward while cycling through colors.',
  starburstNova: 'Sharp radiating rays with a bright flash — explosive and energetic.',
  cometTrail: 'A bright streak shoots upward with a fading trail behind it.',
}

function RollZoomSuffix() {
  const zoomLevel = useStore(s => s.zoomLevel)
  return <>— {Math.round(zoomLevel * 100)}%</>
}
function RollZoomGlance() {
  const zoomLevel = useStore(s => s.zoomLevel)
  return <GlanceLine>{`${Math.round(6 / zoomLevel * 10) / 10}s visible · higher = notes appear larger`}</GlanceLine>
}

function Slider({ label, value, min, max, step, onChange, digits }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; digits: number
}) {
  return (
    <>
      <SubLabel>{`${label} — ${value.toFixed(digits)}`}</SubLabel>
      <Tooltip title="Drag to change" oneLine wrapperStyle={{ display: 'block', width: '100%' }}>
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="orfeo-slider-amber"
          style={{ '--fill': `${((value - min) / (max - min)) * 100}%` } as CSSProperties}
        />
      </Tooltip>
    </>
  )
}

function VisualEffectsExtra() {
  const on = useStore(s => s.hitEffectsEnabled)
  const scope = useStore(s => s.hitEffectScope)
  const setScope = useStore(s => s.setHitEffectScope)
  const color = useStore(s => s.hitEffectColor)
  const setColor = useStore(s => s.setHitEffectColor)
  const pattern = useStore(s => s.hitEffectPattern)
  const setPattern = useStore(s => s.setHitEffectPattern)
  const intensity = useStore(s => s.hitEffectBloomIntensity)
  const spread = useStore(s => s.hitEffectBloomSpread)
  const threshold = useStore(s => s.hitEffectBloomThreshold)
  if (!on) return null
  const st = useStore.getState()
  return (
    <>
      <SubLabel>Scope & Color</SubLabel>
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'stretch' }}>
        <Tooltip
          title={scope === 'keyboard' ? 'Piano tracks only' : 'All tracks'}
          description={scope === 'keyboard'
            ? 'Effects on keyboard tracks only — click to include every track in the file.'
            : 'Effects on every track in the file — click to limit to keyboard tracks only.'}
          wrapperStyle={{ width: 116, flexShrink: 0 }}
        >
          <button
            onClick={() => setScope(scope === 'keyboard' ? 'all' : 'keyboard')}
            style={{ width: 116, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: 0, border: 'none', background: 'none', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', cursor: 'pointer' }}
          >
            {scope === 'keyboard'
              ? <ToggleLeft size={16} strokeWidth={1.5} style={{ flexShrink: 0, color: 'var(--text-amber)' }} />
              : <ToggleRight size={16} strokeWidth={1.5} style={{ flexShrink: 0, color: 'var(--text-amber)' }} />}
            <span style={{ color: 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>
              {scope === 'keyboard' ? 'Piano only' : 'All tracks'}
            </span>
          </button>
        </Tooltip>
        <HitEffectColorSwatch color={color} onChange={setColor} />
        {color && (
          <Tooltip title="Use each track's own color again" wrapperStyle={{ flexShrink: 0 }}>
            <button
              onClick={() => setColor(null)}
              style={{ display: 'flex', alignItems: 'center', color: 'var(--text-dimmest)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dimmest)'}
            ><Undo2 size={11} /></button>
          </Tooltip>
        )}
      </div>
      <SubLabel>Pattern</SubLabel>
      <SettingsDropdown
        value={pattern}
        onChange={v => setPattern(v as HitEffectPattern)}
        options={(Object.keys(HIT_EFFECT_DESCRIPTIONS) as HitEffectPattern[]).map(p => ({
          value: p,
          label: { glowBloom: 'Glow Bloom', rippleRing: 'Ripple Ring', particleBurst: 'Particle Burst', smokePlume: 'Smoke Plume', colorAura: 'Color Aura', starburstNova: 'Starburst Nova', cometTrail: 'Comet Trail' }[p],
          title: HIT_EFFECT_DESCRIPTIONS[p],
        }))}
      />
      <HelpText>{HIT_EFFECT_DESCRIPTIONS[pattern]}</HelpText>
      <Slider label="Intensity" value={intensity} min={0} max={4} step={0.1} digits={1} onChange={st.setHitEffectBloomIntensity} />
      <Slider label="Spread" value={spread} min={0} max={12} step={0.5} digits={1} onChange={st.setHitEffectBloomSpread} />
      <Slider label="Threshold" value={threshold} min={0} max={1} step={0.05} digits={2} onChange={st.setHitEffectBloomThreshold} />
      <HelpText>Lower values make more of the effect glow; higher values only bloom the brightest parts.</HelpText>
    </>
  )
}

export const PIANO_ROLL_DEFS: SettingDef[] = [
  { id: 'rollZoom', icon: ZoomIn, kind: 'choice', Control: RollZoomStepper, Glance: RollZoomGlance, NameSuffix: RollZoomSuffix },
  {
    id: 'barNumbers', icon: Grid3x3, kind: 'switch',
    Control: () => { const v = useStore(s => s.showBarNumbers); return <Switch value={v} onChange={useStore.getState().setShowBarNumbers} label="Bar numbers & grid lines" /> },
  },
  {
    id: 'playbar', icon: Minus, kind: 'switch',
    Control: () => { const v = useStore(s => s.playbarVisible); return <Switch value={v} onChange={useStore.getState().setPlaybarVisible} label="Show Playbar" /> },
  },
  {
    id: 'visualEffects', icon: Sparkles, kind: 'switch', Extra: VisualEffectsExtra,
    Control: () => { const v = useStore(s => s.hitEffectsEnabled); return <Switch value={v} onChange={useStore.getState().setHitEffectsEnabled} label="Visual Effects" /> },
  },
]
