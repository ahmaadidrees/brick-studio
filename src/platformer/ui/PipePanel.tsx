import { Link, X } from 'lucide-react'
import type { Editor } from '../editor/editor'

/** A pipe stays ordinary terrain until the builder chooses an exit. */
export function PipePanel({ editor }: { editor: Editor }) {
  const selected = editor.selectedPipe
  const endpoint = editor.selectedEndpoint
  const exit = editor.selectedExit
  const mouths = editor.pipeMouths
  if (!selected && editor.item.id !== 'pipe') return null
  return (
    <section className="p2d-pipe-panel" aria-label="Pipe settings" onKeyDown={(event) => {
      // Tab, arrows and Space belong to these controls while they have focus.
      event.stopPropagation()
      if (event.key === 'Escape') { event.preventDefault(); editor.cancelPipeLink() }
    }}>
      <div className="p2d-pipe-heading">
        <strong><Link size={16} aria-hidden="true" /> {selected ? 'This pipe' : 'Connect pipes'}</strong>
        {selected && <button type="button" aria-label="Close pipe settings" onClick={() => editor.closePipeSettings()}><X size={18} /></button>}
      </div>
      <label className="p2d-pipe-select">
        <span>Select a placed pipe</span>
        <select value={selected?.join(',') ?? ''} onChange={(event) => {
          if (!event.target.value) { editor.closePipeSettings(); return }
          const [x, y] = event.target.value.split(',').map(Number)
          editor.cancelPipeLink()
          editor.selectPipe(x, y)
        }}>
          <option value="">Choose a pipe…</option>
          {mouths.map(([x, y]) => <option key={`${x},${y}`} value={`${x},${y}`}>Pipe at column {x + 1}, row {y + 1}</option>)}
        </select>
      </label>
      {editor.linkingPipe ? (
        <>
          <p role="status">Choose another pipe, or tap an empty spot to place the exit.</p>
          <button type="button" onClick={() => editor.cancelPipeLink()}>Cancel connection <span className="p2d-pipe-key">Esc</span></button>
        </>
      ) : selected ? (
        <>
          <p role="status">{exit ? `Exit: column ${exit.x + 1}, row ${exit.y + 1}. Stand on top and press Down in Play.` : 'This is a regular pipe. Connect an exit to travel through it.'}</p>
          <button type="button" onClick={() => editor.startPipeLink()}>{exit ? 'Change exit' : 'Connect an exit'}</button>
          {exit && endpoint && <>
            <label className="p2d-pipe-toggle"><input type="checkbox" checked={exit.exitId === endpoint.id} onChange={(event) => editor.setPipeBothWays(event.target.checked)} /> Travel both ways</label>
            <button type="button" onClick={() => editor.disconnectPipe()}>Disconnect</button>
          </>}
        </>
      ) : <p>Place pipes, then select one to connect an exit. Connected pipes show matching letters in Build.</p>}
    </section>
  )
}
