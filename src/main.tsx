import './utils/imeGuard'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
// Dev builds only: simulated USB keyboards (Settings -> MIDI Keyboard), installed
// before the app first asks for MIDI access
import './utils/midiSimulator'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
