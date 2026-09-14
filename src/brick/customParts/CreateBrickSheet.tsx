import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { BRICK_STUDIO_MAX_CUSTOM_PARTS, CUSTOM_BRICK_MAX_WIDTH, CUSTOM_BRICK_MAX_DEPTH, CUSTOM_BRICK_MAX_HEIGHT } from '../brickDocument'
import type { CustomPartDefinition, CustomPartTemplate } from '../types'
import { Button, Dialog, Field, TextField } from '../../ui'
import { createCustomPartDefinition } from './definition'
import { CreateBrickPreview } from './CreateBrickPreview'
import type { CreateBrickDraft } from './definition'
import './create-brick-sheet.css'

const INITIAL_PREVIEW: CreateBrickDraft = { name: 'My brick', template: 'solid', width: 2, depth: 4, height: 3, studs: 'auto' }
const MAX_NAME_LENGTH = 40

/** Every template brick-core accepts (`CustomPartTemplate`); nothing invented from the boards. */
export const CREATE_BRICK_TEMPLATES: ReadonlyArray<{ value: CustomPartTemplate; label: string }> = [
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

/** The real three-way studs choice (`CustomPartDefinition['studs']`), not board 10's on/off toggle. */
export const STUD_OPTIONS: ReadonlyArray<{ value: CustomPartDefinition['studs']; label: string }> = [
  { value: 'auto', label: 'Match the shape' },
  { value: 'full', label: 'Full grid' },
  { value: 'none', label: 'Smooth top' },
]

type DimensionKey = 'width' | 'depth' | 'height'

const DIMENSIONS: ReadonlyArray<{ key: DimensionKey; label: string; unit: 'studs' | 'plates'; max: number; hint: string }> = [
  { key: 'width', label: 'Width', unit: 'studs', max: CUSTOM_BRICK_MAX_WIDTH, hint: `Max ${CUSTOM_BRICK_MAX_WIDTH} studs wide` },
  { key: 'depth', label: 'Depth', unit: 'studs', max: CUSTOM_BRICK_MAX_DEPTH, hint: `Max ${CUSTOM_BRICK_MAX_DEPTH} studs deep` },
  { key: 'height', label: 'Height', unit: 'plates', max: CUSTOM_BRICK_MAX_HEIGHT, hint: `Max ${CUSTOM_BRICK_MAX_HEIGHT} plates high` },
]

export const CUSTOM_PART_CAP_MESSAGE = `This world supports up to ${BRICK_STUDIO_MAX_CUSTOM_PARTS} custom parts.`
export const MATCHING_FOOTPRINT_MESSAGE = 'Round and cone bricks need matching width and depth.'
export const NAME_MESSAGE = `Give your brick a name of up to ${MAX_NAME_LENGTH} characters.`
export const FORM_MESSAGE = 'Fix the highlighted fields to create your brick.'

type FormState = {
  name: string
  template: CustomPartTemplate
  width: string
  depth: string
  height: string
  studs: CustomPartDefinition['studs']
}

const INITIAL_FORM: FormState = {
  name: INITIAL_PREVIEW.name,
  template: INITIAL_PREVIEW.template,
  width: String(INITIAL_PREVIEW.width),
  depth: String(INITIAL_PREVIEW.depth),
  height: String(INITIAL_PREVIEW.height),
  studs: INITIAL_PREVIEW.studs,
}

function boundedInteger(value: string, maximum: number): number | null {
  if (!/^\s*\d+\s*$/.test(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : null
}

function needsMatchingFootprint(template: CustomPartTemplate) {
  return template === 'round' || template === 'cone'
}

export type CreateBrickSheetProps = {
  open: boolean
  existingCount?: number
  onCreate: (definition: CustomPartDefinition) => void
  onClose: () => void
}

/**
 * "Create a brick" (board 10): a centered dialog on the shared Sheet contract
 * with a live demand-rendered geometry preview. Validation is inline per
 * field; the world's custom-part cap disables the primary action instead of
 * failing after the fact. The host places the definition and closes the
 * dialog by flipping `open`.
 */
export function CreateBrickSheet({ open, onCreate, onClose, existingCount = 0 }: CreateBrickSheetProps) {
  const formId = useId()
  const dialogId = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<CreateBrickDraft>(INITIAL_PREVIEW)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(INITIAL_FORM)
    setError(null)
    setPreview(INITIAL_PREVIEW)
    setSubmitted(false)
  }, [open])

  // On compact layouts the brick drawer is itself a sheet that closes when this
  // opens; its unmount cleanup restores focus to the drawer button after the
  // shared Sheet's layout effect has focused this dialog. Passive mount effects
  // run after passive unmount cleanups, so reclaim focus here — and remember
  // where it went, because the original opener inside the drawer no longer
  // exists when this dialog closes and focus would otherwise fall to <body>.
  const fallbackFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!open) return
    const panel = document.getElementById(dialogId)
    const active = document.activeElement
    if (panel && active instanceof HTMLElement && !panel.contains(active)) {
      fallbackFocus.current = active
      panel.focus({ preventScroll: true })
    }
    return () => {
      const fallback = fallbackFocus.current
      fallbackFocus.current = null
      if (fallback?.isConnected && (!document.activeElement || document.activeElement === document.body)) fallback.focus({ preventScroll: true })
    }
  }, [open, dialogId])

  const dimensions = {
    width: boundedInteger(form.width, CUSTOM_BRICK_MAX_WIDTH),
    depth: boundedInteger(form.depth, CUSTOM_BRICK_MAX_DEPTH),
    height: boundedInteger(form.height, CUSTOM_BRICK_MAX_HEIGHT),
  }
  const trimmedName = form.name.trim()
  const nameValid = trimmedName.length > 0 && trimmedName.length <= MAX_NAME_LENGTH
  const dimensionsValid = dimensions.width !== null && dimensions.depth !== null && dimensions.height !== null
  const footprintMismatch = needsMatchingFootprint(form.template) && dimensionsValid && dimensions.width !== dimensions.depth
  const capReached = existingCount >= BRICK_STUDIO_MAX_CUSTOM_PARTS
  const previewHint = !dimensionsValid
    ? 'Enter whole-number dimensions to update the preview.'
    : footprintMismatch
      ? 'Match width and depth to preview this shape.'
      : null

  // Live geometry preview: follows every valid edit and keeps the last valid shape otherwise.
  useEffect(() => {
    if (!open || !dimensionsValid || footprintMismatch) return
    const next: CreateBrickDraft = {
      ...INITIAL_PREVIEW,
      width: dimensions.width!,
      depth: dimensions.depth!,
      height: dimensions.height!,
      template: form.template,
      studs: form.studs,
    }
    setPreview((current) => current.width === next.width && current.depth === next.depth && current.height === next.height
      && current.template === next.template && current.studs === next.studs ? current : next)
  }, [open, dimensionsValid, footprintMismatch, dimensions.width, dimensions.depth, dimensions.height, form.template, form.studs])

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setError(null)
    setForm((current) => ({ ...current, [key]: value }))
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)
    if (capReached) {
      setError(CUSTOM_PART_CAP_MESSAGE)
      return
    }
    if (!nameValid || !dimensionsValid || !CREATE_BRICK_TEMPLATES.some((option) => option.value === form.template)
      || !STUD_OPTIONS.some((option) => option.value === form.studs)) {
      setError(FORM_MESSAGE)
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }
    if (footprintMismatch) {
      setError(MATCHING_FOOTPRINT_MESSAGE)
      formRef.current?.querySelector<HTMLInputElement>('input[name="depth"]')?.focus()
      return
    }
    onCreate(createCustomPartDefinition({
      name: trimmedName,
      template: form.template,
      width: dimensions.width!,
      depth: dimensions.depth!,
      height: dimensions.height!,
      studs: form.studs,
    }))
  }

  const showNameError = !nameValid && (submitted || form.name.length > 0)

  return (
    <Dialog
      id={dialogId}
      open={open}
      onClose={onClose}
      title="Create a brick"
      description="Design your own brick to use in this world."
      size="lg"
      closeLabel="Close create a brick"
      className="create-brick-sheet"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId} disabled={capReached}>Create and place</Button>
        </>
      )}
    >
      <div className="create-brick-workspace">
        <form id={formId} ref={formRef} className="create-brick-form" onSubmit={submit} noValidate>
          <TextField
            label="Name"
            name="name"
            maxLength={MAX_NAME_LENGTH}
            value={form.name}
            autoComplete="off"
            error={showNameError ? NAME_MESSAGE : undefined}
            onChange={(event) => update('name', event.target.value)}
          />
          <Field label="Shape">
            {(control) => (
              <select
                className="ui-input create-brick-select"
                name="template"
                value={form.template}
                onChange={(event) => update('template', event.target.value as CustomPartTemplate)}
                {...control}
              >
                {CREATE_BRICK_TEMPLATES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            )}
          </Field>
          {DIMENSIONS.map(({ key, label, unit, max, hint }) => {
            const value = dimensions[key]
            const invalid = value === null
            const sliderValue = value ?? preview[key]
            return (
              <Field key={key} label={`${label} (${unit})`} hint={hint} error={invalid ? `Enter a whole number from 1 to ${max}.` : undefined}>
                {(control) => (
                  <div className="create-brick-dimension">
                    <input
                      type="range"
                      className="create-brick-slider"
                      aria-label={`Slide ${label.toLowerCase()}`}
                      min={1}
                      max={max}
                      step={1}
                      value={sliderValue}
                      aria-valuetext={`${sliderValue} ${unit}`}
                      onChange={(event) => update(key, event.target.value)}
                    />
                    <input
                      className="ui-input create-brick-number"
                      name={key}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={max}
                      step={1}
                      value={form[key]}
                      onChange={(event) => update(key, event.target.value)}
                      {...control}
                    />
                  </div>
                )}
              </Field>
            )
          })}
          <Field label="Studs on top" hint="Match the shape follows the template; Full grid covers the whole top; Smooth top has no studs.">
            {(control) => (
              <select
                className="ui-input create-brick-select"
                name="studs"
                value={form.studs}
                onChange={(event) => update('studs', event.target.value as CustomPartDefinition['studs'])}
                {...control}
              >
                {STUD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            )}
          </Field>
          {footprintMismatch && !error && <p className="create-brick-notice" role="status">{MATCHING_FOOTPRINT_MESSAGE}</p>}
          {capReached && !error && <p className="create-brick-notice" role="status">{CUSTOM_PART_CAP_MESSAGE} This world already has {existingCount}.</p>}
          {error && <p className="create-brick-error" role="alert">{error}</p>}
        </form>
        <CreateBrickPreview draft={preview} hint={previewHint} />
      </div>
    </Dialog>
  )
}

export default CreateBrickSheet
export { createCustomPartDefinition } from './definition'
export type { CreateBrickDraft } from './definition'
