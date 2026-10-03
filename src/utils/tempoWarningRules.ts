import { TRUST_VERSION, type TrustResult } from './tempoTrust'

// ── When does a song show the tempo warning (top bar light, Library dot)? ──
// Only when the setting is on, the current detector flagged it, the user
// hasn't dismissed it, and the song has no kept Tap Tempo — a kept tempo
// means the user has dealt with it (the TAP pad's own dot marks that).
export function warningVisible(
  s: {
    tempoWarningsEnabled: boolean
    tempoWarningDismissed: Record<string, true>
    tempoCorrections: Record<string, unknown>
    tempoTrustCache: Record<string, (TrustResult & { v: number }) | undefined>
  },
  key: string | null | undefined,
): boolean {
  if (!key || !s.tempoWarningsEnabled || s.tempoWarningDismissed[key] || s.tempoCorrections[key]) return false
  const c = s.tempoTrustCache[key]
  return !!c && c.flagged && c.v === TRUST_VERSION
}
