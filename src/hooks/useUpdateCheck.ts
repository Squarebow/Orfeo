import { useEffect } from 'react'
import { create } from 'zustand'
import type { UpdateStatus, UpdateInfo } from '../types'

// ── One shared update status for the drawer footer and the Settings window
// header. offUpdateStatus() removes every listener, so it is subscribed
// exactly once (useUpdateService, mounted in SettingsPanel). ─────────────
export const useUpdateState = create<{ status: UpdateStatus; info: UpdateInfo }>(() => ({
  status: { state: 'idle' },
  info: { mode: 'manual', releasesUrl: 'https://github.com/Squarebow/Orfeo/releases' },
}))
const setStatus = (status: UpdateStatus) => useUpdateState.setState({ status })

export function pressUpdateButton() {
  const { status, info } = useUpdateState.getState()
  if (info.mode === 'manual') { void window.electronAPI.checkForUpdates(); return }
  if (status.state === 'ready') { void window.electronAPI.installUpdate(); return }
  if (status.state === 'error') { void window.electronAPI.openExternal(info.releasesUrl); return }
  setStatus({ state: 'checking' })
  void window.electronAPI.checkForUpdates()
}

export function useUpdateService() {
  const state = useUpdateState((s) => s.status.state)
  useEffect(() => {
    window.electronAPI.getUpdateInfo().then((info) => useUpdateState.setState({ info })).catch(() => {})
    window.electronAPI.onUpdateStatus(setStatus)
    return () => window.electronAPI.offUpdateStatus()
  }, [])
  // transient states fade back to the plain icon
  useEffect(() => {
    if (!['up-to-date', 'error', 'unavailable'].includes(state)) return
    const t = setTimeout(() => setStatus({ state: 'idle' }), state === 'error' ? 6000 : 3000)
    return () => clearTimeout(t)
  }, [state])
}
