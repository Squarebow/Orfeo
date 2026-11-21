import { Matcher, type Expected } from './matcher'
import { buildTake, worthKeeping, cleanTake, rampAfterRound, loopRounds, type TakeRecord } from './take'
import { howItWent, troubleBars, takesCsv } from './words'
import { withSession, allTakes, saveSession, loadHistory, cachedHistory, forgetHistory, type SongHistory } from './history'

// A take made by hand: `bars` = [bar, hit, missed, extra, waits, waitSec]
function take(p: Partial<TakeRecord> & { bars?: TakeRecord['bars'] } = {}): TakeRecord {
  const bars = p.bars ?? [[1, 4, 0, 0, 0, 0], [2, 4, 0, 0, 0, 0], [3, 4, 0, 0, 0, 0], [4, 4, 0, 0, 0, 0]]
  const sum = (i: number) => bars.reduce((a, b) => a + b[i], 0)
  const counts = p.counts ?? { hit: sum(1), missed: sum(2), extra: sum(3) }
  return {
    at: 1, way: 'practise', hand: 'R', level: 1, wait: false, ramp: false, speed: 100, from: 0, to: 8,
    fromBar: bars[0][0], toBar: bars[bars.length - 1][0], end: 'pause', realSec: 8, overTempo: 1,
    counts, L: { hit: 0, missed: 0, extra: 0 }, R: { ...counts }, bars,
    timing: { mean: 5, spread: 30, n: counts.hit }, waits: sum(4), waitSec: sum(5), ...p,
  }
}

export async function runTakeTest(): Promise<number> {
  console.group('[take] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // ── a take from what Orfeo heard ──
  {
    const exp: Expected[] = Array.from({ length: 12 }, (_, i) => ({ midi: 60 + (i % 5), time: i * 0.5, hand: i % 2 ? 'L' : 'R', bar: 1 + Math.floor(i / 4) }))
    const m = new Matcher(exp, 0.2, t => 1 + Math.floor(t / 2))
    exp.forEach((e, i) => { if (i !== 5) m.play({ midi: e.midi, time: e.time + 0.02 }) })
    m.play({ midi: 90, time: 3.1 })
    m.advance(10)
    const k = buildTake({ summary: m.summary(), ratio: 0.8, from: 0, to: 6, barOf: t => 1 + Math.floor(t / 2), realSec: 9, holds: [{ bar: 2, sec: 1.5 }],
      played: [], end: 'pause', at: 5, meta: { way: 'practise', hand: 'B', level: 1, wait: true, ramp: false } })
    check(k.counts.hit === 11 && k.counts.missed === 1 && k.counts.extra === 1, 'right, missed and extra counted')
    check(k.L.missed === 1 && k.R.missed === 0, 'per hand')
    check(k.speed === 80 && k.timing.mean === 25, 'speed in %, timing in real ms (20 ms at 80 % = 25 ms)')
    check(Math.abs(k.overTempo - 1.2) < 1e-9, 'time over tempo: 9 s for what takes 7.5 s at 80 %')
    const b2 = k.bars.find(b => b[0] === 2)!
    check(b2[2] === 1 && b2[4] === 1 && b2[5] === 1.5, 'bar 2: the missed note and the wait')
    check(k.fromBar === 1 && k.toBar === 3, 'bars 1 to 3')
    check(worthKeeping(k), 'twelve notes: worth keeping')
  }

  // ── Speed up gradually ──
  {
    let r = { speed: 60, streak: 0 }
    let x = rampAfterRound(r, true); check(!x.raised && x.streak === 1, 'one clean round: not yet')
    x = rampAfterRound(x, true); check(x.raised && x.speed === 65 && x.streak === 0, 'two clean rounds: 5 % faster')
    x = rampAfterRound({ speed: 65, streak: 1 }, false); check(x.streak === 0 && x.speed === 65, 'a slip: start counting again, never slower')
    x = rampAfterRound({ speed: 98, streak: 1 }, true); check(x.speed === 100, 'never past the song\'s own tempo')
    r = { speed: 100, streak: 1 }; check(!rampAfterRound(r, true).raised, 'at 100 % it stays')
    check(cleanTake(take()) && !cleanTake(take({ bars: [[1, 4, 1, 0, 0, 0]] })) && !cleanTake(take({ waits: 1 })), 'clean: nothing missed, at most one stray key, no waiting')
  }

  // ── rounds of the loop ──
  {
    const round = (clean: boolean) => take({ end: 'loop', from: 2, bars: [[2, 4, clean ? 0 : 1, 0, 0, 0]] })
    check(loopRounds([round(false), round(true), round(true)]).rounds === 3, 'three rounds')
    check(loopRounds([round(false), round(true), round(true)]).cleanRun === 2, 'the last two clean')
    check(loopRounds([take({ end: 'loop', from: 0 }), round(true)]).rounds === 1, 'another loop is another count')
  }

  // ── the words ──
  {
    const good = howItWent(take())
    check(good.lines[0].startsWith('Lovely') && !good.focus, 'all right: lovely, nothing to go over')
    check(good.lines.some(l => l.includes('steady')), 'steady timing said')

    const rough = take({ bars: [[1, 4, 0, 0, 0, 0], [2, 4, 0, 0, 0, 0], [3, 1, 3, 2, 0, 0], [4, 2, 2, 0, 0, 0], [5, 4, 0, 0, 0, 0], [6, 4, 0, 0, 0, 0]] })
    const w = howItWent(rough)
    check(w.focus?.from === 3 && w.focus?.to === 4, 'bars 3–4 are the ones to go over')
    check(w.lines.some(l => l === 'Bars 3–4 are worth another go.'), 'and it says so')
    check(!w.lines.some(l => /wrong|bad|fail|poor/i.test(l)), 'never a harsh word')

    const hands = take({ hand: 'B', counts: { hit: 15, missed: 5, extra: 0 }, L: { hit: 5, missed: 5, extra: 0 }, R: { hit: 10, missed: 0, extra: 0 } })
    const hw = howItWent(hands)
    check(hw.lines[0] === 'Most of the right hand was spot on.' && hw.lines[1].includes('left hand'), 'the steady hand first, then the one to give time')

    check(howItWent(take({ timing: { mean: -40, spread: 30, n: 16 } })).lines.some(l => l.includes('ahead')), 'ahead of the beat')
    check(howItWent(take({ timing: { mean: 0, spread: 100, n: 16 } }), { metronome: true }).lines.some(l => l.includes('metronome')), 'wandering timing: the metronome can help')

    const waiting = take({ way: 'wait', hand: 'B', wait: true, realSec: 12, overTempo: 1.5, bars: [[1, 4, 0, 0, 0, 0], [2, 4, 0, 0, 2, 3], [3, 4, 0, 0, 0, 0], [4, 4, 0, 0, 0, 0]] })
    const ww = howItWent(waiting)
    check(ww.lines[0] === 'The song only had to wait for you a few times.', 'waiting: how often it waited')
    check(ww.lines.some(l => l === "It took about 50 % longer than the song's own tempo."), 'time over tempo in words')
    check(ww.lines.some(l => l.startsWith('The song waited longest in bar 2')), 'where it waited longest')
    check(!ww.lines.some(l => l.includes('beat')), 'no timing talk when the song waited')

    const before = take({ at: 0, bars: [[1, 2, 2, 0, 0, 0], [2, 2, 2, 0, 0, 0], [3, 4, 0, 0, 0, 0], [4, 4, 0, 0, 0, 0]] })
    check(howItWent(take(), { earlier: [before] }).lines.some(l => l.includes('than last time')), 'better than last time: said')
    check(!howItWent(before, { earlier: [take()] }).lines.some(l => l.includes('last time')), 'worse than last time: not said')
    check(!howItWent(take(), { earlier: [take({ way: 'perform' })] }).lines.some(l => l.includes('last time')), 'compared only with the same way of playing')

    const round = (clean: boolean) => take({ end: 'loop', from: 2, bars: [[2, 4, clean ? 0 : 1, 0, 0, 0]] })
    const rw = howItWent(round(true), { session: [round(false), round(true), round(true)], rampedTo: 70 })
    check(rw.lines.includes('3 times round the loop, the last 2 without a slip.') && rw.lines.includes('The speed is up to 70 % now.'), 'rounds and speed said')
    check(howItWent(take(), { rampedTo: 100 }).lines.some(l => l.includes("song's own tempo now")), 'reaching the song\'s tempo is celebrated')
    check(troubleBars(take()) === null, 'no trouble, no bars')
  }

  // ── CSV ──
  {
    const csv = takesCsv([take(), take({ way: 'wait', hand: 'B' })])
    const rows = csv.trim().split('\r\n')
    check(rows.length === 3 && rows[0].startsWith('Date,Time,Way'), 'a header and one row per take')
    check(rows[2].includes('Wait for me') && rows[2].includes('Both'), 'ways and hands in words')
  }

  // ── history ──
  {
    let h: SongHistory = { v: 1, sessions: [] }
    for (let i = 1; i <= 7; i++) h = withSession(h, { id: i, notes: 100, takes: [take({ played: [[0, 60, 80, 0, 5]] })] })
    check(h.sessions.length === 7, 'every session kept')
    check(h.sessions.filter(s => s.takes[0].played).length === 5 && !h.sessions[0].takes[0].played, 'only the last five keep the notes played')
    h = withSession(h, { id: 7, notes: 100, takes: [take(), take()] })
    check(h.sessions.length === 7 && h.sessions[6].takes.length === 2, 'the same session brought up to date, not added twice')
    check(allTakes(h, 7).length === 6, 'earlier takes, leaving this session out')

    const song = 'C:\\Lib\\test.mid'
    await saveSession(song, { id: 1, notes: 10, takes: [take()] })
    check((await loadHistory(song)).sessions.length === 1 && cachedHistory(song)?.sessions.length === 1, 'saved and read back (in memory outside the app)')
    await forgetHistory(song)
    check(cachedHistory(song)?.sessions.length === 0, 'forgotten')
  }

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
