// ── Play and Pause from outside practice mode's header (recording) ──────────
// The header owns the playback (usePlayback is a hook); it registers its Play
// and Pause here so a recording can start the song and stop it, the same way
// the button does.
type Transport = { play: () => void; pause: () => void }
let transport: Transport | null = null
export function registerPracticeTransport(t: Transport | null): void { transport = t }
export const practiceTransport = (): Transport | null => transport
