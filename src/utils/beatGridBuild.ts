// ── File beat + bar grid honouring the FULL tempo map AND every time-
// signature change. Shared by midiParser.ts (the app's parsed file) and the
// lean tempo-warning analysis (tempoTrustAnalyze.ts), so both always agree
// on where the file's own bar lines fall. `header` is @tonejs/midi's Header
// (ticksToSeconds() is exact against its tempo map). ────────────────────
export interface GridHeader {
  ppq: number
  timeSignatures: { ticks: number; timeSignature: number[] }[]
  ticksToSeconds(ticks: number): number
  secondsToTicks(seconds: number): number
}

export function buildFileGrid(header: GridHeader, duration: number): { barTimes: number[]; beatTimes: number[] } {
  const barTimes: number[] = []
  const beatTimes: number[] = []
  const ppq = header.ppq
  const sigList = header.timeSignatures
  const sigAt = (tick: number): [number, number] => {
    let cur: [number, number] = sigList[0] ? sigList[0].timeSignature as [number, number] : [4, 4]
    for (const s of sigList) { if (s.ticks <= tick) cur = s.timeSignature as [number, number]; else break }
    return cur
  }
  const endTick = header.secondsToTicks(duration) + ppq * 4
  let tick = 0
  let guard = 0
  while (tick < endTick && guard++ < 100000) {
    const [num, den] = sigAt(tick)
    if (!(num > 0) || !(den > 0)) break
    barTimes.push(header.ticksToSeconds(tick))
    const beatTick = (ppq * 4) / den
    for (let b = 0; b < num; b++) beatTimes.push(header.ticksToSeconds(tick + b * beatTick))
    tick += beatTick * num
  }
  return { barTimes, beatTimes }
}
