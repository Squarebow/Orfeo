import { GROUPS, SETTINGS, SETTING_BY_ID, QUICK_LAYOUT } from './catalog'
import { searchSettings, gridColumns, MIN_CARD_WIDTH, CARD_GAP } from './search'

export function runCatalogTest(): number {
  console.group('[settings catalog] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // 1. 8 groups in the drawing's order, each with intro + orfeo.cc manual link
  check(GROUPS.map(g => g.id).join() === 'audio,midi-files-library,playback-editing,practice,notation,keyboard,piano-roll,appearance', 'group order')
  check(GROUPS.every(g => g.intro.length > 20 && g.manualUrl.startsWith('https://orfeo.cc/docs')), 'intro + manual url on every group')

  // 2. unique ids, every setting in a known group, every group non-empty, sizes per spec §4
  const ids = SETTINGS.map(s => s.id)
  check(new Set(ids).size === ids.length, 'unique setting ids')
  const count = (g: string) => SETTINGS.filter(s => s.group === g).length
  check([3, 2, 7, 4, 5, 5, 4, 2].join() === GROUPS.map(g => count(g.id)).join(), `group sizes ${GROUPS.map(g => count(g.id))}`)
  check(SETTINGS.every(s => s.name && s.summary && s.description), 'name/summary/description on every setting')
  check(SETTINGS.every(s => !s.summary.includes('\n') && s.summary.length <= 90), 'summaries are one short line')

  // 3. Quick Settings = exactly the drawing's shortlist, in its order
  const quick = GROUPS.map(g => QUICK_LAYOUT[g.id].map(i => (typeof i === 'string' ? i : `#${i.heading}`)).join('+')).join(' | ')
  check(quick === 'soundEngine | showDemo | focusMode+tapTempo+handAssignment | chordPrompter | displaySystem+accidentals+chordTracking | keyRange+showOctaves+showNoteNames | rollZoom+barNumbers+playbar | appZoom', `quick layout: ${quick}`)
  check(GROUPS.every(g => QUICK_LAYOUT[g.id].every(i => typeof i !== 'string' || SETTING_BY_ID[i].group === g.id)), 'quick items sit in their own group')

  // 4. search: name, description, keywords; case + accent insensitive; all words must match
  check(searchSettings('').length === 0 && searchSettings('   ').length === 0, 'empty query -> no results')
  const ids0 = (q: string) => searchSettings(q).flatMap(r => r.settings.map(s => s.id))
  check(ids0('tap tempo').includes('tapTempo'), 'by name')
  check(ids0('TAP TEMPO').includes('tapTempo'), 'case-insensitive')
  check(ids0('solfege').includes('displaySystem'), 'accent-insensitive (Solfège)')
  check(ids0('soundfont').includes('soundFonts'), 'by keyword')
  check(ids0('metronome count').includes('countIn') && !ids0('metronome count').includes('tapTempo'), 'all words must match')
  const grouped = searchSettings('show')
  check(grouped.every((r, i) => i === 0 || GROUPS.indexOf(r.group) > GROUPS.indexOf(grouped[i - 1].group)), 'results in group order')
  check(searchSettings('zzzqqq').length === 0, 'no match -> empty')

  // 5. grid columns: 3 (or 2 for a 2-setting group) when wide, fewer when narrow, never 0
  const wide = 3 * MIN_CARD_WIDTH + 2 * CARD_GAP + 40
  check(gridColumns(7, wide) === 3 && gridColumns(2, wide) === 2 && gridColumns(1, wide) === 1, 'wide: 3 / 2 / 1')
  check(gridColumns(7, 2 * MIN_CARD_WIDTH + CARD_GAP + 5) === 2, 'mid width: 2')
  check(gridColumns(7, 300) === 1 && gridColumns(7, 0) === 1, 'narrow / unmeasured: 1')

  console.log(`settings catalog: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}

import { DEFS } from './defs'
export function runDefsCoverageTest(): number {
  let fail = 0
  for (const s of SETTINGS) if (!DEFS[s.id]) { fail++; console.error('FAIL: no def for', s.id) }
  for (const id of Object.keys(DEFS)) if (!SETTINGS.some(s => s.id === id)) { fail++; console.error('FAIL: def without catalog entry', id) }
  console.log(`defs coverage: ${fail} failed`)
  return fail
}
