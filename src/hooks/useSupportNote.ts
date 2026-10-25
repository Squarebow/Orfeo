import { useEffect } from 'react'
import { create } from 'zustand'
import { useStore } from '../store'
import type { SupportNoteInfo } from '../types'

// ── The "Enjoying Orfeo?" note (components/SupportNote.tsx) and the Store
// build's Rate Orfeo star. Main decides which build this is and whether the
// note is due this launch (note:info in electron/main.ts). ─────────────────
// `preview`: shown from the test-build button in Settings › Appearance — which
// version's note, and closing it saves nothing
export const useSupportNote = create<SupportNoteInfo & { noteOpen: boolean; preview: { store: boolean } | null }>(() => ({
  store: false, prompt: false, noteOpen: false, preview: null,
}))

// Not at startup: the note appears once Orfeo has been open a little while
const NOTE_DELAY_MS = 30_000

// Test builds: show either version's note right away, over the app
export function previewSupportNote(store: boolean) {
  useStore.getState().closeSettingsWindow()
  useSupportNote.setState({ noteOpen: true, preview: { store } })
}

export function useSupportNoteService() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    window.electronAPI.getSupportNoteInfo().then((info) => {
      useSupportNote.setState(info)
      if (info.prompt) timer = setTimeout(() => {
        // Settings › Appearance › Enjoying Orfeo? can switch it off
        if (useStore.getState().supportNoteEnabled) useSupportNote.setState({ noteOpen: true })
      }, NOTE_DELAY_MS)
    }).catch(() => {})
    return () => clearTimeout(timer)
  }, [])
}

export async function requestStoreReview() {
  useSupportNote.setState({ noteOpen: false, preview: null })
  await window.electronAPI.requestReview().catch(() => {})
}

// 'later' — until the next 5th launch · 'never' — the Store note's "Don't show
// again" · 'snooze' — "Disable for 30 days"
export function closeSupportNote(how: 'later' | 'never' | 'snooze') {
  const { preview } = useSupportNote.getState()
  useSupportNote.setState({ noteOpen: false, preview: null })
  if (preview) return
  if (how === 'never') void window.electronAPI.neverShowSupportNote()
  if (how === 'snooze') void window.electronAPI.snoozeSupportNote()
}
