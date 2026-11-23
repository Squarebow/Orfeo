import './utils/imeGuard'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
// Dev builds only: simulated USB keyboards (Settings -> MIDI Keyboard), installed
// before the app first asks for MIDI access
import './utils/midiSimulator'
// Dev and test builds: the trained hand model reads the hands (Settings ›
// Dev Tools › Hand reading switches back to today's engine)
import { setHandModelOn } from './utils/handModelReader'
import { startHandPrescan } from './practice/handPrescan'
if (import.meta.env.DEV || import.meta.env.MODE === 'test-build') { setHandModelOn(true); startHandPrescan() }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
