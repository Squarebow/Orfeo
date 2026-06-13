import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { detectChord } from '@/utils/chordDetection'
import { LEFT_HAND_COLOR } from '@/utils/colors'

export function useMidiDevice() {
  const pressKey = useStore(s => s.pressKey)
  const releaseKey = useStore(s => s.releaseKey)
  const activeKeys = useStore(s => s.activeKeys)
  const setCurrentChord = useStore(s => s.setCurrentChord)
  const settings = useStore(s => s.settings)

  const [isConnected, setIsConnected] = useState(false)
  const [deviceName, setDeviceName] = useState<string | null>(null)
  const accessRef = useRef<MIDIAccess | null>(null)

  useEffect(() => {
    if (!navigator.requestMIDIAccess) return

    navigator.requestMIDIAccess({ sysex: false }).then((access) => {
      accessRef.current = access

      const connect = () => {
        const inputs = Array.from(access.inputs.values())
        if (inputs.length > 0) {
          setIsConnected(true)
          setDeviceName(inputs[0].name ?? 'MIDI Device')

          inputs.forEach(input => {
            input.onmidimessage = (event) => {
              const [status, note, velocity] = event.data ?? []
              const type = status & 0xf0

              if (type === 0x90 && velocity > 0) {
                // Note on
                pressKey(note, LEFT_HAND_COLOR, 'midi-keyboard')
              } else if (type === 0x80 || (type === 0x90 && velocity === 0)) {
                // Note off
                releaseKey(note)
              }
            }
          })
        } else {
          setIsConnected(false)
          setDeviceName(null)
        }
      }

      connect()
      access.onstatechange = connect
    }).catch(() => {
      // MIDI not available — silent fail, app works without it
    })

    return () => {
      if (accessRef.current) {
        Array.from(accessRef.current.inputs.values()).forEach(input => {
          input.onmidimessage = null
        })
      }
    }
  }, [pressKey, releaseKey])

  // Update chord detection when active keys change
  useEffect(() => {
    const midiNumbers = Array.from(activeKeys.keys())
    const chord = detectChord(midiNumbers, settings.noteNaming)
    setCurrentChord(chord)
  }, [activeKeys, settings.noteNaming, setCurrentChord])

  return { isConnected, deviceName }
}
