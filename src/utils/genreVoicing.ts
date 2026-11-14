import { t } from './i18n'

export type Genre = 'classic' | 'coltrane' | 'cinematic' | 'roadhouse' | 'gospel' | 'ipanema' | 'carnival' | 'flamenco' | 'velvet'

export const GENRE_LABELS: Record<Genre, string> = {
  classic:   t`Classic`,
  coltrane:  t`Coltrane`,
  cinematic: t`Cinematic`,
  roadhouse: t`Roadhouse`,
  gospel:    t`Gospel`,
  ipanema:   t`Ipanema`,
  carnival:  t`Carnival`,
  flamenco:  t`Flamenco`,
  velvet:    t`Velvet`,
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
  IV:  { major: 'M7#11',   minor: 'm11',  diminished: 'm7b5' },
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

// ── Gospel: rich church harmony — 6/9 home chord, maj9 and minor 9ths/11ths,
// a 13th on V, ♭VII as a dominant 9th, vii° as the full diminished 7th ──
const GOSPEL_MAP: DegreeMap = {
  I:   { major: '6/9',  minor: 'm9',   diminished: 'dim7' },
  II:  { major: '9',    minor: 'm9',   diminished: 'm7b5' },
  III: { major: 'maj7', minor: 'm7',   diminished: 'dim7' },
  IV:  { major: 'maj9', minor: 'm9',   diminished: 'dim7' },
  V:   { major: '13',   minor: 'm9',   diminished: 'dim7' },
  VI:  { major: 'maj9', minor: 'm11',  diminished: 'dim7' },
  VII: { major: '9',    minor: 'm7b5', diminished: 'dim7' },
}

// ── Flamenco: Phrygian colour — V (major or minor) becomes the 7♭9 Phrygian
// dominant, VI and II open into maj7♯11 like the open-string guitar chord,
// III takes a maj7. Everything else stays a plain triad. ─────────────────
const FLAMENCO_MAP: DegreeMap = {
  II:  { major: 'M7#11' },
  III: { major: 'maj7' },
  V:   { major: '7b9', minor: '7b9' },
  VI:  { major: 'M7#11' },
}

const GENRE_MAPS: Partial<Record<Genre, DegreeMap>> = {
  coltrane:  COLTRANE_MAP,
  cinematic: CINEMATIC_MAP,
  roadhouse: ROADHOUSE_MAP,
  gospel:    GOSPEL_MAP,
  ipanema:   IPANEMA_MAP,
  carnival:  CARNIVAL_MAP,
  flamenco:  FLAMENCO_MAP,
  velvet:    VELVET_MAP,
}

// ── Return the genre-appropriate chord type key for a roman numeral step ─
// Classic: quality straight from the numeral (vi → minor, I → major,
// ii° → dim). Other styles: their own chord for that degree + quality, and
// the Classic chord wherever the style has none (Roadhouse's vi stays minor).
export function getGenreVoicing(genre: Genre, romanLabel: string): string {
  const { degree, quality } = parseRomanLabel(romanLabel)
  const classic = quality === 'minor' ? 'minor' : quality === 'diminished' ? 'dim' : 'major'
  if (genre === 'classic') return classic
  return GENRE_MAPS[genre]?.[degree]?.[quality] ?? classic
}

// ── Tritone substitution (Ipanema) — a V that resolves down a fifth to the
// next chord is swapped for the dominant a tritone away: D♭7♯11 in place of
// G7 going to C. The ♯11 of the substitute is the original V's root. ────
const TRITONE_SUB_GENRES = new Set<Genre>(['ipanema'])
export const TRITONE_SUB_CHORD = '7#11'

export function isTritoneSub(genre: Genre, label: string, offset: number, nextOffset: number | undefined): boolean {
  if (!TRITONE_SUB_GENRES.has(genre) || label !== 'V' || nextOffset === undefined) return false
  return ((offset + 5) % 12) === (((nextOffset % 12) + 12) % 12)
}
