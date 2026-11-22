// ── Play, Pause and play-from from outside practice mode's header (recording) ──────────
// The header owns the playback (usePlayback is a hook); it registers its Play,
// Pause and play-from-a-place here, so a recording can start the song (from
// its start) and stop it, the same way the buttons do.
type Transport = { play: () => void; pause: () => void; playFrom: (t: number) => void }
let transport: Transport | null = null
export function registerPracticeTransport(t: Transport | null): void { transport = t }
export const practiceTransport = (): Transport | null => transport
