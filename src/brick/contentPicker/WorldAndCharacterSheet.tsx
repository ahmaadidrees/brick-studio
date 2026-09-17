import { CharacterStudio } from '../characters/CharacterStudio'
import { BUILD_PLATE_SIZES, type BuildPlateSize } from '../buildPlate'
import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Eye } from 'lucide-react'
import type { EnvironmentId } from '../types'
import type { CharacterDescriptor, EnvironmentDescriptor } from '../registries'
import { Button, Sheet } from '../../ui'
import { ContentPicker } from './ContentPicker'
import type { CharacterPaletteGroup, ContentPickerProps } from './ContentPicker'
import { normalizeContentPickerSelection } from './selection'
import type { ContentPickerSelection } from './selection'
import './world-character-sheet.css'

/**
 * "Scene & character" — a fully controlled sheet around ContentPicker on the
 * shared src/ui Sheet (right-docked on wide screens so the live world stays
 * visible for the private preview; a bottom sheet on phones and touch).
 *
 * Contract: the host owns `open` and the committed `selection`. While the
 * sheet is open it edits a private draft seeded from `selection` (normalized
 * against the descriptor catalog). Cancel, Escape, the close button, and the
 * backdrop all discard the draft and call `onClose`; the Apply button calls
 * `onApply` exactly once with one combined selection — environment id,
 * character id, and palette together — and never leaks partial choices into
 * app state. The host closes the sheet by flipping `open` in its handlers.
 *
 * A host that cannot honor a plate change (brick-core `resizeBuildPlate`
 * rejected the shrink) may return `{ ok: false, message }` from `onApply`;
 * the sheet then stays open and presents that message with
 * "Keep current size" / "Back to building" instead of closing.
 *
 * The component renders nothing while closed, imports only descriptor types
 * (never environment/character implementations), and has no store coupling.
 */
export type WorldAndCharacterApplyRejection = { ok: false; message: string }
export type WorldAndCharacterApplyResult = void | undefined | boolean | WorldAndCharacterApplyRejection

export type WorldAndCharacterSheetProps = {
  open: boolean
  plateSize?: BuildPlateSize
  canResizePlate?: boolean
  initialTab?: 'environment' | 'character'
  environmentDescriptors: readonly EnvironmentDescriptor[]
  characterDescriptors: readonly CharacterDescriptor[]
  /** The app's committed selection; seeds the draft each time the sheet opens. */
  selection: ContentPickerSelection
  paletteGroups?: readonly CharacterPaletteGroup[]
  /** One combined draft — fired only by the Apply button. May report a plate-resize rejection. */
  onApply: (selection: ContentPickerSelection, plateSize?: BuildPlateSize) => WorldAndCharacterApplyResult
  /** Cancel/Escape/backdrop/close-button; the draft is discarded. */
  onClose: () => void
  /** Draft-time preview intents (hover/focus/selection); never a commitment. */
  onRequestPreview?: ContentPickerProps['onRequestPreview']
  /** Optional lazy-preview state shown accessibly on each card. */
  previewStatuses?: ContentPickerProps['previewStatuses']
  /** Private draft preview; hosts must not persist or broadcast this value. */
  onDraftChange?: (selection: ContentPickerSelection) => void
  title?: string
  description?: string
  applyLabel?: string
  cancelLabel?: string
}

export const PLATE_RESIZE_STAYS_CENTERED = 'Your creation stays centered.'
export const PLATE_RESIZE_LOCKED = 'Plate size can’t be changed here. Only the world owner can resize it, from Build.'
export const PREVIEW_EYEBROW = 'Preview — only you can see this'
export const DEFAULT_EYEBROW = 'Make it yours'

// The scene tab hides the picker's character section; character edits go through CharacterStudio.
const ignoreCharacter = () => {}

function isRejection(result: WorldAndCharacterApplyResult): result is WorldAndCharacterApplyRejection {
  return typeof result === 'object' && result !== null && result.ok === false && typeof result.message === 'string'
}

function sameSelection(a: ContentPickerSelection, b: ContentPickerSelection) {
  return a.environmentId === b.environmentId
    && a.characterId === b.characterId
    && JSON.stringify(a.palette ?? {}) === JSON.stringify(b.palette ?? {})
    && JSON.stringify(a.appearance ?? null) === JSON.stringify(b.appearance ?? null)
}

/** Nested plate outlines at true scale — sizes only, never a fake capture of the build. */
function PlateShrinkDiagram({ current, next }: { current: BuildPlateSize; next: BuildPlateSize }) {
  const outer = 120
  const inner = Math.round((next / current) * outer)
  const offset = (outer - inner) / 2
  const studs = 8
  const step = outer / studs
  return (
    <svg className="plate-resize-diagram" viewBox={`-6 -6 ${outer + 12} ${outer + 12}`} role="img"
      aria-label={`A ${next} by ${next} plate drawn inside the current ${current} by ${current} plate.`}>
      <rect className="plate-resize-diagram-current" width={outer} height={outer} rx="6" />
      {Array.from({ length: studs * studs }, (_, index) => (
        <circle key={index} className="plate-resize-diagram-stud"
          cx={(index % studs) * step + step / 2} cy={Math.floor(index / studs) * step + step / 2} r={step * 0.18} />
      ))}
      <rect className="plate-resize-diagram-next" x={offset} y={offset} width={inner} height={inner} rx="4" />
    </svg>
  )
}

export function WorldAndCharacterSheet({
  open,
  initialTab = 'environment',
  plateSize,
  canResizePlate = false,
  environmentDescriptors,
  characterDescriptors,
  selection,
  paletteGroups = [],
  onApply,
  onClose,
  onRequestPreview,
  previewStatuses,
  onDraftChange,
  title = 'Scene & character',
  description = 'Choose a setting for your world and who you will be, then press Apply.',
  applyLabel = 'Apply',
  cancelLabel = 'Cancel',
}: WorldAndCharacterSheetProps) {
  const sceneTabId = useId()
  const characterTabId = useId()
  const tabPanelId = useId()
  const plateHintId = useId()
  const rejectionTitleId = useId()
  const sceneTabRef = useRef<HTMLButtonElement>(null)
  const characterTabRef = useRef<HTMLButtonElement>(null)
  const plateGroupRef = useRef<HTMLDivElement>(null)
  const rejectionRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<ContentPickerSelection>(() => normalizeContentPickerSelection(
    selection,
    { environments: environmentDescriptors, characters: characterDescriptors },
  ))
  const [draftPlateSize, setDraftPlateSize] = useState(plateSize)
  const [activeTab, setActiveTab] = useState<'environment' | 'character'>('environment')
  const [applyRejection, setApplyRejection] = useState<string | null>(null)

  // Latest inputs for the open-edge seeding effect, so reopening always seeds
  // from the current committed selection without re-seeding mid-edit.
  const seedRef = useRef({ selection, environmentDescriptors, characterDescriptors })
  seedRef.current = { selection, environmentDescriptors, characterDescriptors }

  useEffect(() => {
    if (!open) return
    const seed = seedRef.current
    setDraft(normalizeContentPickerSelection(seed.selection, {
      environments: seed.environmentDescriptors,
      characters: seed.characterDescriptors,
    }))
    setDraftPlateSize(plateSize)
    setActiveTab(initialTab)
    setApplyRejection(null)
  }, [open, initialTab])

  useEffect(() => {
    if (open) onDraftChange?.({ ...draft, palette: { ...draft.palette } })
  }, [draft, onDraftChange, open])

  useEffect(() => {
    if (applyRejection) rejectionRef.current?.focus()
  }, [applyRejection])

  if (!open) return null

  const environment = environmentDescriptors.find(({ id }) => id === draft.environmentId)
  const character = characterDescriptors.find(({ id }) => id === draft.characterId)
  const applyDisabled = !draft.environmentId || !draft.characterId
  const committed = normalizeContentPickerSelection(selection, {
    environments: environmentDescriptors,
    characters: characterDescriptors,
  })
  const plateChanged = Boolean(plateSize && draftPlateSize && draftPlateSize !== plateSize)
  const shrinking = Boolean(plateSize && draftPlateSize && draftPlateSize < plateSize)
  const hasDraftChanges = plateChanged || !sameSelection(committed, draft)
  const showShrinkRejection = Boolean(applyRejection && shrinking && plateSize && draftPlateSize)

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    let nextTab: typeof activeTab
    if (event.key === 'Home') nextTab = 'environment'
    else if (event.key === 'End') nextTab = 'character'
    else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      nextTab = activeTab === 'environment' ? 'character' : 'environment'
    } else return
    event.preventDefault()
    setActiveTab(nextTab)
    const nextRef = nextTab === 'environment' ? sceneTabRef : characterTabRef
    nextRef.current?.focus()
  }

  const keepCurrentSize = () => {
    setDraftPlateSize(plateSize)
    setApplyRejection(null)
    setActiveTab('environment')
    window.requestAnimationFrame?.(() => {
      plateGroupRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus()
    })
  }

  const apply = () => {
    const nextSelection = { ...draft, palette: { ...draft.palette } }
    const result = draftPlateSize ? onApply(nextSelection, draftPlateSize) : onApply(nextSelection)
    if (isRejection(result)) setApplyRejection(result.message)
  }

  const plateHint = shrinking
    ? `${PLATE_RESIZE_STAYS_CENTERED} Bricks near the edge must fit inside the smaller plate.`
    : PLATE_RESIZE_STAYS_CENTERED

  const footer = showShrinkRejection
    ? (
      <div className="plate-resize-rejection-actions">
        <Button variant="primary" fullWidth onClick={keepCurrentSize}>Keep current size</Button>
        <Button variant="quiet" fullWidth onClick={onClose}>Back to building</Button>
      </div>
    )
    : (
      <>
        <span className="world-character-sheet-summary" aria-live="polite">
          {environment && character
            ? `${environment.name} · ${character.name}${plateChanged ? ` · ${draftPlateSize} × ${draftPlateSize} plate` : ''}`
            : 'Pick a scene and a character'}
        </span>
        <Button variant="secondary" className="world-character-sheet-cancel" onClick={onClose}>{cancelLabel}</Button>
        <Button variant="primary" className="world-character-sheet-apply" disabled={applyDisabled} onClick={apply}>{activeTab === 'character' && applyLabel === 'Apply' ? 'Use this look' : applyLabel}</Button>
      </>
    )

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={activeTab === 'character' && title === 'Scene & character' ? 'Character Studio' : title}
      description={activeTab === 'character' ? 'Choose a character, make it yours, then use your look.' : description}
      size="lg"
      closeLabel="Close without applying"
      className={`world-character-sheet${activeTab === 'character' ? ' world-character-sheet--studio' : ''}`}
      footer={footer}
    >
      {/* `.world-character-sheet-body` stays for the QA scripts; the shared sheet body is the scroll container. */}
      <div className="world-character-sheet-body">
        {showShrinkRejection ? (
          <div
            ref={rejectionRef}
            className="plate-resize-rejection"
            role="alert"
            aria-labelledby={rejectionTitleId}
            tabIndex={-1}
          >
            <h3 id={rejectionTitleId}>Can’t shrink the plate yet</h3>
            <p className="plate-resize-rejection-message">{applyRejection}</p>
            <PlateShrinkDiagram current={plateSize!} next={draftPlateSize!} />
            <ul className="plate-resize-legend">
              <li><i className="plate-resize-legend-next" aria-hidden="true" />New {draftPlateSize} × {draftPlateSize} plate</li>
              <li><i className="plate-resize-legend-current" aria-hidden="true" />Current {plateSize} × {plateSize} plate</li>
            </ul>
          </div>
        ) : (
          <>
            <div className="world-character-sheet-tabs-bar">
              <span className="world-character-sheet-eyebrow" data-preview={hasDraftChanges || undefined}>
                {hasDraftChanges && <Eye size={14} aria-hidden="true" />}
                {hasDraftChanges ? PREVIEW_EYEBROW : DEFAULT_EYEBROW}
              </span>
              <div className="world-character-sheet-tabs" role="tablist" aria-label="Scene and character settings">
                <button
                  ref={sceneTabRef}
                  id={sceneTabId}
                  type="button"
                  role="tab"
                  tabIndex={activeTab === 'environment' ? 0 : -1}
                  aria-controls={tabPanelId}
                  aria-selected={activeTab === 'environment'}
                  onClick={() => setActiveTab('environment')}
                  onKeyDown={handleTabKeyDown}
                >Scene</button>
                <button
                  ref={characterTabRef}
                  id={characterTabId}
                  type="button"
                  role="tab"
                  tabIndex={activeTab === 'character' ? 0 : -1}
                  aria-controls={tabPanelId}
                  aria-selected={activeTab === 'character'}
                  onClick={() => setActiveTab('character')}
                  onKeyDown={handleTabKeyDown}
                >Character</button>
              </div>
            </div>
            <div
              className="world-character-sheet-tabpanel"
              id={tabPanelId}
              role="tabpanel"
              aria-labelledby={activeTab === 'environment' ? sceneTabId : characterTabId}
            >
              {activeTab === 'environment' && (
                <ContentPicker
                  hideHeader
                  visibleSection="environment"
                  environmentDescriptors={environmentDescriptors}
                  characterDescriptors={characterDescriptors}
                  selectedEnvironmentId={draft.environmentId}
                  selectedCharacterId={draft.characterId}
                  onSelectEnvironment={(environmentId: EnvironmentId) => {
                    setDraft((current) => ({ ...current, environmentId }))
                  }}
                  onSelectCharacter={ignoreCharacter}
                  onRequestPreview={onRequestPreview}
                  previewStatuses={previewStatuses}
                />
              )}
              {activeTab === 'environment' && plateSize && (
                <fieldset className="plate-size-picker" disabled={!canResizePlate}>
                  <legend>Build plate</legend>
                  <span className="plate-size-current">Now {plateSize} × {plateSize}</span>
                  <p className="plate-size-lead">Choose the size for your building space.</p>
                  <div
                    ref={plateGroupRef}
                    className="plate-size-options"
                    role="group"
                    aria-label="Build plate size"
                    aria-describedby={plateHintId}
                  >
                    {BUILD_PLATE_SIZES.map((size) => (
                      <button
                        type="button"
                        key={size}
                        aria-pressed={draftPlateSize === size}
                        data-current={size === plateSize || undefined}
                        onClick={() => { setDraftPlateSize(size); setApplyRejection(null) }}
                      >{size} × {size}</button>
                    ))}
                  </div>
                  <p id={plateHintId} className="plate-size-hint">{canResizePlate ? plateHint : PLATE_RESIZE_LOCKED}</p>
                </fieldset>
              )}
              {activeTab === 'character' && (
                <CharacterStudio
                  draft={draft}
                  onDraftChange={setDraft}
                  characterDescriptors={characterDescriptors}
                  paletteGroups={paletteGroups}
                  onRequestPreview={onRequestPreview}
                  previewStatuses={previewStatuses}
                />
              )}
            </div>
            {applyRejection && !showShrinkRejection && (
              <p className="world-character-sheet-error" role="alert">{applyRejection}</p>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}

export default WorldAndCharacterSheet
