import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { CharacterId, EnvironmentId } from '../types'
import type { CharacterDescriptor, EnvironmentDescriptor } from '../registries'
import { ContentPicker } from './ContentPicker'
import type { CharacterPaletteGroup, ContentPickerProps } from './ContentPicker'
import { normalizeContentPickerSelection } from './selection'
import type { ContentPickerSelection } from './selection'
import './world-character-sheet.css'

/**
 * "Scene & character" — a fully controlled modal sheet around ContentPicker.
 *
 * Contract: the host owns `open` and the committed `selection`. While the
 * sheet is open it edits a private draft seeded from `selection` (normalized
 * against the descriptor catalog). Cancel, Escape, the close button, and the
 * backdrop all discard the draft and call `onClose`; the Apply button calls
 * `onApply` exactly once with one combined selection — environment id,
 * character id, and palette together — and never leaks partial choices into
 * app state. The host closes the sheet by flipping `open` in its handlers.
 *
 * The component renders nothing while closed, imports only descriptor types
 * (never environment/character implementations), and has no store coupling.
 */
export type WorldAndCharacterSheetProps = {
  open: boolean
  environmentDescriptors: readonly EnvironmentDescriptor[]
  characterDescriptors: readonly CharacterDescriptor[]
  /** The app's committed selection; seeds the draft each time the sheet opens. */
  selection: ContentPickerSelection
  paletteGroups?: readonly CharacterPaletteGroup[]
  /** One combined draft — fired only by the Apply button. */
  onApply: (selection: ContentPickerSelection) => void
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

const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]'

function focusableElements(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
    .filter((element) => element.tabIndex >= 0)
}

export function WorldAndCharacterSheet({
  open,
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
  const titleId = useId()
  const descriptionId = useId()
  const sceneTabId = useId()
  const characterTabId = useId()
  const tabPanelId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const sceneTabRef = useRef<HTMLButtonElement>(null)
  const characterTabRef = useRef<HTMLButtonElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const [draft, setDraft] = useState<ContentPickerSelection>(() => normalizeContentPickerSelection(
    selection,
    { environments: environmentDescriptors, characters: characterDescriptors },
  ))
  const [activeTab, setActiveTab] = useState<'environment' | 'character'>('environment')

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
    setActiveTab('environment')
  }, [open])

  useEffect(() => {
    if (open) onDraftChange?.({ ...draft, palette: { ...draft.palette } })
  }, [draft, onDraftChange, open])

  useEffect(() => {
    if (!open) return
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus()
    return () => {
      const previous = restoreFocusRef.current
      if (previous?.isConnected) previous.focus()
    }
  }, [open])

  if (!open) return null

  const environment = environmentDescriptors.find(({ id }) => id === draft.environmentId)
  const character = characterDescriptors.find(({ id }) => id === draft.characterId)
  const applyDisabled = !draft.environmentId || !draft.characterId

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

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !panelRef.current) return
    const focusable = focusableElements(panelRef.current)
    if (!focusable.length) {
      event.preventDefault()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === panelRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="world-character-sheet">
      <div
        className="world-character-sheet-backdrop"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="world-character-sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onKeyDown={handlePanelKeyDown}
      >
        <header className="world-character-sheet-header">
          <div>
            <span className="world-character-sheet-eyebrow">Make it yours</span>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
          </div>
          <button
            type="button"
            className="world-character-sheet-close"
            aria-label="Close without applying"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
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
        <div
          className="world-character-sheet-body"
          id={tabPanelId}
          role="tabpanel"
          aria-labelledby={activeTab === 'environment' ? sceneTabId : characterTabId}
        >
          <ContentPicker
            hideHeader
            visibleSection={activeTab}
            environmentDescriptors={environmentDescriptors}
            characterDescriptors={characterDescriptors}
            selectedEnvironmentId={draft.environmentId}
            selectedCharacterId={draft.characterId}
            onSelectEnvironment={(environmentId: EnvironmentId) => {
              setDraft((current) => ({ ...current, environmentId }))
            }}
            onSelectCharacter={(characterId: CharacterId) => {
              setDraft((current) => ({ ...current, characterId }))
            }}
            palette={draft.palette}
            paletteGroups={paletteGroups}
            onPaletteChange={(palette) => setDraft((current) => ({ ...current, palette }))}
            onRequestPreview={onRequestPreview}
            previewStatuses={previewStatuses}
          />
        </div>
        <footer className="world-character-sheet-footer">
          <span className="world-character-sheet-summary" aria-live="polite">
            {environment && character ? `${environment.name} · ${character.name}` : 'Pick a scene and a character'}
          </span>
          <button
            type="button"
            className="world-character-sheet-cancel"
            onClick={onClose}
          >{cancelLabel}</button>
          <button
            type="button"
            className="world-character-sheet-apply"
            disabled={applyDisabled}
            onClick={() => onApply({ ...draft, palette: { ...draft.palette } })}
          >{applyLabel}</button>
        </footer>
      </div>
    </div>
  )
}

export default WorldAndCharacterSheet
