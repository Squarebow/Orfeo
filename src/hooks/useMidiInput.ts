// ── Captures live note-on/note-off events from hardware MIDI devices ──────────
// Uses the Web MIDI API (navigator.requestMIDIAccess), available natively in
// Electron's Chromium renderer — no additional package required.
// All devices are merged into a single note stream; no per-device selection.

import { useEffect, useRef } from 'react'
import { useStore } from '../store'

const HARDWARE_COLOR = '#e8a027'

// ── Write a note-on into activeKeys and route audio to the active engine ──────
function pressNote(midiNum: number, vel: number) {
  const { activeKeys, activeKeyColors } = useStore.getState()
  const nk = new Set(activeKeys); nk.add(midiNum)
  const nc = new Map(activeKeyColors); nc.set(midiNum, HARDWARE_COLOR)
  useStore.setState({ activeKeys: nk, activeKeyColors: nc })
  const { audioEngine } = useStore.getState()
  if (audioEngine === 'samples') {
    ;(window as any).__orfeoNoteOnSamples?.(midiNum, vel / 127)
  } else {
    ;(window as any).__orfeoNoteOn?.(midiNum, vel / 127)
  }
}

// ── Remove a note from activeKeys and send note-off to the active engine ──────
function releaseNote(midiNum: number) {
  const { activeKeys, activeKeyColors } = useStore.getState()
  const nk = new Set(activeKeys); nk.delete(midiNum)
  const nc = new Map(activeKeyColors); nc.delete(midiNum)
  useStore.setState({ activeKeys: nk, activeKeyColors: nc })
  const { audioEngine } = useStore.getState()
  if (audioEngine === 'samples') {
    ;(window as any).__orfeoNoteOffSamples?.(midiNum)
  } else {
    ;(window as any).__orfeoNoteOff?.(midiNum)
  }
}

// ── Parse a raw MIDIMessageEvent and dispatch press/release ──────────────────
function handleMessage(e: MIDIMessageEvent) {
  const data = e.data
  if (!data || data.length < 2) return
  const status = data[0] & 0xF0
  const note   = data[1]
  const vel    = data.length > 2 ? data[2] : 0
  if (status === 0x90 && vel > 0) {
    pressNote(note, vel)
  } else if (status === 0x80 || (status === 0x90 && vel === 0)) {
    releaseNote(note)
  }
}

// ── Hook: request MIDI access, wire all devices, update store on state change ─
export function useMidiInput() {
  const accessRef   = useRef<MIDIAccess | null>(null)
  // Map of input port id → attached listener (for precise cleanup)
  const listenersRef = useRef<Map<string, EventListener>>(new Map())

  useEffect(() => {
    // ── Web MIDI setup — skipped if API unavailable in this Electron context ───
    if (navigator.requestMIDIAccess) {
      // ── Attach midimessage listener to one input port ───────────────────────
      function attachInput(input: MIDIInput) {
        if (listenersRef.current.has(input.id)) return
        const handler = (e: Event) => handleMessage(e as MIDIMessageEvent)
        input.addEventListener('midimessage', handler)
        listenersRef.current.set(input.id, handler)
      }

      // ── Re-enumerate all inputs and update store device state ───────────────
      function syncInputs(access: MIDIAccess) {
        access.inputs.forEach(input => attachInput(input))
        const inputs = Array.from(access.inputs.values())
        if (inputs.length > 0) {
          useStore.getState().setMidiDevice(true, inputs[0].name ?? '')
        } else {
          useStore.getState().setMidiDevice(false)
        }
      }

      navigator.requestMIDIAccess().then((access) => {
        accessRef.current = access
        syncInputs(access)
        access.onstatechange = () => syncInputs(access)
      }).catch((e) => {
        console.warn('[Orfeo MIDI] Web MIDI access denied or unavailable:', e)
      })
    }

    // ── Cleanup: detach all listeners and cancel state-change handler ─────────
    return () => {
      const access = accessRef.current
      if (access) {
        access.inputs.forEach((input) => {
          const handler = listenersRef.current.get(input.id)
          if (handler) input.removeEventListener('midimessage', handler)
        })
        access.onstatechange = null
      }
      listenersRef.current.clear()
    }
  }, [])
}
