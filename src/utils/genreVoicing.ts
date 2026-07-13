export type Genre = 'classic' | 'coltrane' | 'cinematic' | 'roadhouse' | 'ipanema' | 'carnival' | 'velvet'

export const GENRE_LABELS: Record<Genre, string> = {
  classic:   'Classic',
  coltrane:  'Coltrane',
  cinematic: 'Cinematic',
  roadhouse: 'Roadhouse',
  ipanema:   'Ipanema',
  carnival:  'Carnival',
  velvet:    'Velvet',
}

// ── Strip b/# prefix and ° suffix, classify degree + quality ─────────────
// Lowercase Roman numeral → minor; ° suffix → diminished; uppercase → major.
// b/# prefixes (bVII, bIII) modify degree only — stripped before case check.
function parseRomanLabel(label: string): { degree: string; quality: 'major' | 'minor' | 'diminished' } {
  const isDim = label.includes('°')
  const stripped = label.replace(/^b/, '').replace(/^#/, '').replace(/°$/, '')
  const isMinor = !isDim && stripped === stripped.toLowerCase()
  return {
    degree: stripped.toUpperCase(),
    quality: isDim ? 'diminished' : isMinor ? 'minor' : 'major',
  }
}

type QualityMap = Partial<Record<'major' | 'minor' | 'diminished', string>>
type DegreeMap = Partial<Record<string, QualityMap>>

// All chord type strings verified against tonal 6.4.3 ChordType.all()

// ── Coltrane: extended jazz harmony — maj9 on I, dom13 on V, m7b5 on dim ─
const COLTRANE_MAP: DegreeMap = {
  I:   { major: 'maj9',  minor: 'm9',   diminished: 'm7b5' },
  II:  { major: 'maj7',  minor: 'm7',   diminished: 'm7b5' },
  III: { major: 'maj7',  minor: 'm7',   diminished: 'm7b5' },
  IV:  { major: 'maj7',  minor: 'm7',   diminished: 'm7b5' },
  V:   { major: '13',    minor: 'm7',   diminished: 'm7b5' },
  VI:  { major: 'maj7',  minor: 'm9',   diminished: 'm7b5' },
  VII: { major: 'maj7',  minor: 'm7',   diminished: 'm7b5' },
}

// ── Cinematic: airy add9/sus voicings — uncluttered, no dense 7th stacking
const CINEMATIC_MAP: DegreeMap = {
  I:   { major: 'Madd9', minor: 'madd9' },
  II:  { major: 'Madd9', minor: 'm7'    },
  III: { major: 'Madd9', minor: 'm7'    },
  IV:  { major: 'Madd9', minor: 'm7'    },
  V:   { major: '9sus4', minor: 'm7'    },
  VI:  { major: 'Madd9', minor: 'madd9' },
  // VII and diminished fall through to Classic quality resolution
}

// ── Roadhouse: dominant 7ths on I/IV/V — classic blues convention ────────
// Intentional genre override: I as dom7 is correct in blues.
const ROADHOUSE_MAP: DegreeMap = {
  I:  { major: '7', minor: '7', diminished: '7' },
  IV: { major: '7', minor: '7', diminished: '7' },
  V:  { major: '7', minor: '7', diminished: '7' },
}

// ── Ipanema: 9ths and 11ths with tritone-substitution lean — bossa nova ──
// maj7#11 on IV for the characteristic Lydian lift; dom13 on V; m7b5 on dim.
// Major II/III/VI use maj9 by analogy; minor V uses m9 (modal bossa context).
const IPANEMA_MAP: DegreeMap = {
  I:   { major: 'maj9',    minor: 'm9',   diminished: 'm7b5' },
  II:  { major: 'maj9',    minor: 'm11',  diminished: 'm7b5' },
  III: { major: 'maj9',    minor: 'm9',   diminished: 'm7b5' },
  IV:  { major: 'maj7#11', minor: 'm11',  diminished: 'm7b5' },
  V:   { major: '13',      minor: 'm9',   diminished: 'm7b5' },
  VI:  { major: 'maj9',    minor: 'm9',   diminished: 'm7b5' },
  VII: { major: 'maj7',    minor: 'm7b5', diminished: 'm7b5' },
}

// ── Carnival: bright festive 7ths — samba character ──────────────────────
// IV uses maj7 (safer samba subdominant); V uses dom7; all others maj7/m7.
const CARNIVAL_MAP: DegreeMap = {
  I:   { major: 'maj7', minor: 'm7',   diminished: 'm7b5' },
  II:  { major: 'maj7', minor: 'm7',   diminished: 'm7b5' },
  III: { major: 'maj7', minor: 'm7',   diminished: 'm7b5' },
  IV:  { major: 'maj7', minor: 'm7',   diminished: 'm7b5' },
  V:   { major: '7',    minor: 'm7',   diminished: 'm7b5' },
  VI:  { major: 'maj7', minor: 'm7',   diminished: 'm7b5' },
  VII: { major: 'maj7', minor: 'm7b5', diminished: 'm7b5' },
}

// ── Velvet: deep 11ths and 13ths, mellow and laid-back — neo-soul ────────
// maj9#11 on IV for Lydian colour; 7b9b13 on V (altered dom); m9b5 on VII
// (half-dim + 9th, verified in tonal 6.4.3 as 1P 2M 3m 5d 7m).
const VELVET_MAP: DegreeMap = {
  I:   { major: 'maj13',  minor: 'm13',  diminished: 'm7b5' },
  II:  { major: 'maj9',   minor: 'm11',  diminished: 'm7b5' },
  III: { major: 'maj9',   minor: 'm11',  diminished: 'm7b5' },
  IV:  { major: 'maj9#11', minor: 'm11', diminished: 'm7b5' },
  V:   { major: '7b9b13', minor: 'm11',  diminished: 'm7b5' },
  VI:  { major: 'maj13',  minor: 'm11',  diminished: 'm7b5' },
  VII: { major: 'maj7',   minor: 'm9b5', diminished: 'm9b5' },
}

const GENRE_MAPS: Partial<Record<Genre, DegreeMap>> = {
  coltrane:  COLTRANE_MAP,
  cinematic: CINEMATIC_MAP,
  roadhouse: ROADHOUSE_MAP,
  ipanema:   IPANEMA_MAP,
  carnival:  CARNIVAL_MAP,
  velvet:    VELVET_MAP,
}

// ── Return the genre-appropriate chord type key for a roman numeral step ─
// Classic: derives quality purely from the Roman numeral case/suffix
// (vi → minor, I → major, ii° → dim) — independent of baseKey. This is
// the canonical diatonic quality system; baseKey is not consulted.
// Other genres: look up degree + quality in their extension map, fall back
// to baseKey when no override exists for that degree/quality combination.
export function getGenreVoicing(genre: Genre, romanLabel: string, baseKey: string): string {
  const { degree, quality } = parseRomanLabel(romanLabel)

  if (genre === 'classic') {
    if (quality === 'minor')      return 'minor'
    if (quality === 'diminished') return 'dim'
    return 'major'
  }

  const map = GENRE_MAPS[genre]
  if (!map) return baseKey
  return map[degree]?.[quality] ?? baseKey
}
