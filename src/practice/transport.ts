// ── Play, Pause and Seek from outside practice mode's header (recording) ──────────
// The header owns the playback (usePlayback is a hook); it registers its Play,
// Pause and Seek here, so a recording can start the song from its start (with
// the count-in, as Play does) and stop it, the same way the buttons do.
type Transport = { play: () => void; pause: () => void; seek: (t: number) => void }
let transport: Transport | null = null
export function registerPracticeTransport(t: Transport | null): void { transport = t }
export const practiceTransport = (): Transport | null => transport
