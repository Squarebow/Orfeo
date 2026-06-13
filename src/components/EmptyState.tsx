import { FolderOpen, Music2 } from 'lucide-react'
import { useMidiFile } from '../hooks/useMidiFile'

export default function EmptyState() {
  const { openFile } = useMidiFile()

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 select-none">
      <div
        className="rounded-2xl p-5"
        style={{ background: '#1a1a22', border: '1px solid #252530' }}
      >
        <Music2 size={40} style={{ color: '#e8a02740' }} />
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-base font-medium" style={{ color: '#606078' }}>
          No file open
        </span>
        <span className="text-sm" style={{ color: '#353545' }}>
          Open a .mid or .midi file to get started
        </span>
      </div>
      <button
        onClick={openFile}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium"
        style={{ background: '#e8a027', color: '#0f0f12' }}
      >
        <FolderOpen size={15} />
        Open MIDI file
      </button>
      <span className="text-xs mt-1" style={{ color: '#252535' }}>Ctrl+O</span>
    </div>
  )
}