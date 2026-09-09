import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { BRICK_STUDIO_MAX_CUSTOM_PARTS } from '../brickDocument'
import type { CustomPartDefinition, CustomPartTemplate } from '../types'
import { createCustomPartDefinition } from './definition'
import type { CreateBrickDraft } from './definition'
import './create-brick-sheet.css'

const TEMPLATES: ReadonlyArray<{ value: CustomPartTemplate; label: string }> = [
  { value: 'solid', label: 'Classic brick' },
  { value: 'slope', label: 'Slope' },
  { value: 'invertedSlope', label: 'Overhang' },
  { value: 'corner', label: 'Corner' },
  { value: 'round', label: 'Round' },
  { value: 'cone', label: 'Cone' },
  { value: 'stairs', label: 'Steps' },
  { value: 'arch', label: 'Arch' },
  { value: 'window', label: 'Window' },
  { value: 'door', label: 'Door' },
]

function boundedInteger(value: FormDataEntryValue | null, minimum: number, maximum: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null
}

export type CreateBrickSheetProps = {
  open: boolean
  existingCount?: number
  onCreate: (definition: CustomPartDefinition) => void
  onClose: () => void
}

export function CreateBrickSheet({ open, onCreate, onClose, existingCount = 0 }: CreateBrickSheetProps) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    panel.current?.focus()
  }, [open])

  if (!open) return null

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const template = String(form.get('template') ?? '') as CustomPartTemplate
    const width = boundedInteger(form.get('width'), 1, 8)
    const depth = boundedInteger(form.get('depth'), 1, 8)
    const height = boundedInteger(form.get('height'), 1, 12)
    const studs = String(form.get('studs') ?? '') as CustomPartDefinition['studs']
    if (!name || name.length > 40 || !TEMPLATES.some((option) => option.value === template)
      || width === null || depth === null || height === null || !['auto', 'full', 'none'].includes(studs)) {
      setError('Use a name and whole-number dimensions inside the shown limits.')
      return
    }
    if (existingCount >= BRICK_STUDIO_MAX_CUSTOM_PARTS) {
      setError(`This world supports up to ${BRICK_STUDIO_MAX_CUSTOM_PARTS} custom parts.`)
      return
    }
    if ((template === 'round' || template === 'cone') && width !== depth) {
      setError('Round and cone bricks need matching width and depth.')
      return
    }
    onCreate(createCustomPartDefinition({ name, template, width, depth, height, studs }))
  }

  return (
    <div className="create-brick-sheet">
      <button className="create-brick-backdrop" type="button" aria-label="Cancel creating a brick" onClick={onClose} />
      <div
        ref={panel}
        className="create-brick-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            onClose()
          }
        }}
      >
        <header>
          <div><span>Brick drawer</span><h2 id={titleId}>Create a brick</h2></div>
          <button type="button" aria-label="Close create a brick" onClick={onClose}>×</button>
        </header>
        <p>Choose a familiar shape and snapped dimensions. Your brick stays editable, shareable, and safe for multiplayer.</p>
        <form onSubmit={submit}>
          <label>Name<input name="name" maxLength={40} defaultValue="My brick" required /></label>
          <label>Shape<select name="template" defaultValue="solid">{TEMPLATES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <div className="create-brick-dimensions">
            <label>Width <small>studs</small><input name="width" type="number" inputMode="numeric" min={1} max={8} defaultValue={2} required /></label>
            <label>Depth <small>studs</small><input name="depth" type="number" inputMode="numeric" min={1} max={8} defaultValue={4} required /></label>
            <label>Height <small>plates</small><input name="height" type="number" inputMode="numeric" min={1} max={12} defaultValue={3} required /></label>
          </div>
          <label>Top studs<select name="studs" defaultValue="auto"><option value="auto">Match the shape</option><option value="full">Full grid</option><option value="none">Smooth top</option></select></label>
          {error && <p className="create-brick-error" role="alert">{error}</p>}
          <footer><button type="button" onClick={onClose}>Cancel</button><button type="submit">Create and place</button></footer>
        </form>
      </div>
    </div>
  )
}

export default CreateBrickSheet
export { createCustomPartDefinition } from './definition'
export type { CreateBrickDraft } from './definition'
