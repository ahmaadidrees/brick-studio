import { useState, type FormEvent } from 'react'
import type { VariableDeclaration, BlockDeclaration } from '../program/catalog'
import { isSafeIdentifier } from '../program/types'
import './authoring.css'

type Props = {
  mode: 'variable' | 'block'
  variables: readonly VariableDeclaration[]
  blocks: readonly BlockDeclaration[]
  onVariable: (variable: VariableDeclaration) => void
  onBlock: (block: BlockDeclaration) => void
  onClose: () => void
}

export function AuthoringDialog({ mode, variables, blocks, onVariable, onBlock, onClose }: Props) {
  const [name, setName] = useState('')
  const [scope, setScope] = useState<VariableDeclaration['scope']>('my')
  const [advanced, setAdvanced] = useState(false)
  const [args, setArgs] = useState(['', '', ''])
  const trimmed = name.trim()
  const namedArgs = args.map((arg) => arg.trim()).filter(Boolean)
  const uniqueArgs = new Set(namedArgs)
  const gap = args.some((arg, index) => !arg.trim() && args.slice(index + 1).some((later) => later.trim()))
  const duplicate = mode === 'variable'
    ? variables.some((variable) => variable.name === trimmed && variable.scope === scope)
    : blocks.some((block) => block.name === trimmed)
  const valid = isSafeIdentifier(trimmed) && !duplicate && (mode === 'variable' || (!gap && namedArgs.every(isSafeIdentifier) && uniqueArgs.size === namedArgs.length && !uniqueArgs.has(trimmed)))

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!valid) return
    if (mode === 'variable') onVariable({ name: trimmed, scope })
    else onBlock({ name: trimmed, args: namedArgs })
  }

  return (
    <div className="lab-authoring-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="lab-authoring-dialog" role="dialog" aria-modal="true" aria-label={mode === 'variable' ? 'Make a Variable' : 'Make a Block'} onSubmit={submit} onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}>
        <h2>{mode === 'variable' ? 'Make a Variable' : 'Make a Block'}</h2>
        <p>{mode === 'variable' ? 'Give this number a name. Then drag its blocks from Variables.' : 'Name an action you can run again. Build its steps inside the new definition.'}</p>
        <label className="lab-authoring-field">
          Name
          <input autoFocus maxLength={24} value={name} onChange={(event) => setName(event.target.value)} placeholder={mode === 'variable' ? 'score' : 'boost'} aria-describedby="lab-authoring-hint" />
        </label>
        <small id="lab-authoring-hint">Start with a letter; use up to 24 letters, numbers, or underscores.</small>
        {mode === 'variable' ? (
          <>
            <button className="lab-authoring-advanced" type="button" aria-expanded={advanced} onClick={() => setAdvanced((open) => !open)}>Who can use it? {advanced ? '▴' : '▾'}</button>
            {advanced && <label className="lab-authoring-field">Keep this number for
              <select value={scope} onChange={(event) => setScope(event.target.value as VariableDeclaration['scope'])}>
                <option value="my">This thing</option>
                <option value="world">The whole world</option>
                <option value="player">The player</option>
              </select>
            </label>}
          </>
        ) : (
          <fieldset className="lab-authoring-args">
            <legend>Number inputs (optional)</legend>
            {args.map((arg, index) => <label key={index}>Input {index + 1}<input maxLength={24} value={arg} onChange={(event) => setArgs((old) => old.map((value, i) => i === index ? event.target.value : value))} placeholder={['amount', 'speed', 'direction'][index]} /></label>)}
          </fieldset>
        )}
        {duplicate && <p className="lab-authoring-error">That name already exists here.</p>}
        {mode === 'block' && uniqueArgs.size !== namedArgs.length && <p className="lab-authoring-error">Give each input a different name.</p>}
        {mode === 'block' && gap && <p className="lab-authoring-error">Fill inputs from the first box onward.</p>}
        <div className="lab-authoring-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={!valid}>Create</button>
        </div>
      </form>
    </div>
  )
}
