// ── The trained hand model, switched into the engine ─────────────────────────
// setHandModelOn(true) makes every one-stream hand reading (a one-track piano, a
// merge, Prepare for practice, the readiness check) go through the trained
// model after the dividing line (handAssignment.ts › setSecondHandReader).
// Every reading is remembered (handReadCache.ts), and the library is read
// ahead in the background (handPrescan.ts), so songs open on readings already
// made. Dev mode and test builds only until it ships: Settings › Dev Tools ›
// Hand reading switches it and compares the two on the open song.

import { setSecondHandReader, type Hand } from './handAssignment'
import { HandModel, unpackHandModel } from './handModel'
import { HAND_MODEL_WEIGHTS } from './handModelWeights'
import { rememberingReader } from './handReadCache'

let model: HandModel | null = null
/** The shipped model, built on first use (unpacking takes a few milliseconds). */
export function shippedHandModel(): HandModel {
  if (!model) model = new HandModel(unpackHandModel(HAND_MODEL_WEIGHTS))
  return model
}
export const HAND_MODEL_NAME = HAND_MODEL_WEIGHTS.name

const reader = rememberingReader(HAND_MODEL_WEIGHTS.name,
  (notes, engine) => shippedHandModel().read(notes, engine).map(r => ({ hand: r.hand as Hand, confidence: r.confidence })))

/** The model in this engine only (the background reader's own copy) */
export function installHandModel(enable: boolean): void {
  on = enable
  setSecondHandReader(enable ? reader : null, `m${HAND_MODEL_WEIGHTS.name}`)
}

let on = false
export function setHandModelOn(enable: boolean): void {
  installHandModel(enable)
  // the renderer tells the main process, whose saves work out hands too
  if (typeof window !== 'undefined') void (window as any).electronAPI?.setHandModel?.(enable)
}
export const handModelOn = (): boolean => on
