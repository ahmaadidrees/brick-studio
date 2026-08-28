import { useId, useRef } from 'react'
import type { CSSProperties, KeyboardEvent, MutableRefObject, ReactNode } from 'react'
import type { CharacterPalette } from '../characters/types'
import type { CharacterDescriptor, EnvironmentDescriptor } from '../registries'
import type { CharacterId, EnvironmentId } from '../types'
import { updateCharacterPalette } from './selection'
import './content-picker.css'

export type ContentPreviewKind = 'environment' | 'character'
export type ContentPreviewReason = 'hover' | 'focus' | 'selection'

export type CharacterPaletteSwatch = {
  value: string
  label: string
}

export type CharacterPaletteGroup = {
  key: string
  label: string
  swatches: readonly CharacterPaletteSwatch[]
}

export type ContentPickerProps = {
  environmentDescriptors: readonly EnvironmentDescriptor[]
  characterDescriptors: readonly CharacterDescriptor[]
  selectedEnvironmentId: EnvironmentId | null
  selectedCharacterId: CharacterId | null
  onSelectEnvironment: (id: EnvironmentId) => void
  onSelectCharacter: (id: CharacterId) => void
  onRequestPreview?: (
    kind: ContentPreviewKind,
    id: EnvironmentId | CharacterId,
    reason: ContentPreviewReason,
  ) => void
  palette?: Readonly<CharacterPalette>
  paletteGroups?: readonly CharacterPaletteGroup[]
  onPaletteChange?: (palette: CharacterPalette) => void
  title?: string
  description?: string
  className?: string
}

type PickerCard = {
  id: EnvironmentId | CharacterId
  name: string
  description: string
  previewKey: string
}

type SelectionGridProps<T extends PickerCard> = {
  kind: ContentPreviewKind
  label: string
  descriptors: readonly T[]
  selectedId: T['id'] | null
  emptyCopy: string
  onSelect: (id: T['id']) => void
  onRequestPreview?: ContentPickerProps['onRequestPreview']
}

function PreviewArtwork({ kind, previewKey }: { kind: ContentPreviewKind; previewKey: string }) {
  return (
    <span
      className={`content-picker-art content-picker-art-${kind}`}
      data-preview-key={previewKey}
      aria-hidden="true"
    >
      <span className="content-picker-art-sky" />
      <span className="content-picker-art-subject" />
      <span className="content-picker-art-detail" />
    </span>
  )
}

function moveSelection<T extends PickerCard>(
  event: KeyboardEvent<HTMLButtonElement>,
  index: number,
  descriptors: readonly T[],
  buttonRefs: MutableRefObject<Array<HTMLButtonElement | null>>,
  onSelect: (id: T['id']) => void,
  onRequest: (id: T['id']) => void,
) {
  if (descriptors.length < 2) return

  let nextIndex: number | null = null
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % descriptors.length
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + descriptors.length) % descriptors.length
  if (event.key === 'Home') nextIndex = 0
  if (event.key === 'End') nextIndex = descriptors.length - 1
  if (nextIndex === null) return

  event.preventDefault()
  const descriptor = descriptors[nextIndex]
  buttonRefs.current[nextIndex]?.focus()
  onSelect(descriptor.id)
  onRequest(descriptor.id)
}

function SelectionGrid<T extends PickerCard>({
  kind,
  label,
  descriptors,
  selectedId,
  emptyCopy,
  onSelect,
  onRequestPreview,
}: SelectionGridProps<T>) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])
  const hasSelectedCard = descriptors.some(({ id }) => id === selectedId)

  if (!descriptors.length) return <p className="content-picker-empty">{emptyCopy}</p>

  return (
    <div className="content-picker-grid" role="radiogroup" aria-label={label}>
      {descriptors.map((descriptor, index) => {
        const selected = descriptor.id === selectedId
        const requestPreview = (reason: ContentPreviewReason) => {
          onRequestPreview?.(kind, descriptor.id, reason)
        }
        const select = () => {
          onSelect(descriptor.id)
          requestPreview('selection')
        }

        return (
          <button
            key={descriptor.id}
            ref={(button) => { buttonRefs.current[index] = button }}
            className="content-picker-card"
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (!hasSelectedCard && index === 0) ? 0 : -1}
            onClick={select}
            onPointerEnter={() => requestPreview('hover')}
            onFocus={() => requestPreview('focus')}
            onKeyDown={(event) => moveSelection(
              event,
              index,
              descriptors,
              buttonRefs,
              onSelect,
              (id) => onRequestPreview?.(kind, id, 'selection'),
            )}
          >
            <PreviewArtwork kind={kind} previewKey={descriptor.previewKey} />
            <span className="content-picker-card-copy">
              <strong>{descriptor.name}</strong>
              <small>{descriptor.description}</small>
            </span>
            <span className="content-picker-check" aria-hidden="true">✓</span>
          </button>
        )
      })}
    </div>
  )
}

function SectionHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="content-picker-section-heading">
      <div>
        <span>{eyebrow}</span>
        <h3>{title}</h3>
      </div>
      {children}
    </div>
  )
}

export function ContentPicker({
  environmentDescriptors,
  characterDescriptors,
  selectedEnvironmentId,
  selectedCharacterId,
  onSelectEnvironment,
  onSelectCharacter,
  onRequestPreview,
  palette = {},
  paletteGroups = [],
  onPaletteChange,
  title = 'Choose your world',
  description = 'Pick a place to build, then choose who you will explore it as.',
  className,
}: ContentPickerProps) {
  const headingId = useId()
  const selectedCharacter = characterDescriptors.find(({ id }) => id === selectedCharacterId)
  const showPalette = Boolean(selectedCharacter?.customizable && paletteGroups.length && onPaletteChange)

  return (
    <section
      className={['content-picker', className].filter(Boolean).join(' ')}
      aria-labelledby={headingId}
    >
      <header className="content-picker-heading">
        <span className="content-picker-eyebrow">World setup</span>
        <h2 id={headingId}>{title}</h2>
        <p>{description}</p>
      </header>

      <div className="content-picker-section">
        <SectionHeading eyebrow="Step 1" title="Environment">
          <span className="content-picker-selection-summary" aria-live="polite">
            {environmentDescriptors.find(({ id }) => id === selectedEnvironmentId)?.name ?? 'Not selected'}
          </span>
        </SectionHeading>
        <SelectionGrid
          kind="environment"
          label="Choose an environment"
          descriptors={environmentDescriptors}
          selectedId={selectedEnvironmentId}
          emptyCopy="No environments are available yet."
          onSelect={onSelectEnvironment}
          onRequestPreview={onRequestPreview}
        />
      </div>

      <div className="content-picker-section">
        <SectionHeading eyebrow="Step 2" title="Character">
          <span className="content-picker-selection-summary" aria-live="polite">
            {selectedCharacter?.name ?? 'Not selected'}
          </span>
        </SectionHeading>
        <SelectionGrid
          kind="character"
          label="Choose a character"
          descriptors={characterDescriptors}
          selectedId={selectedCharacterId}
          emptyCopy="No characters are available yet."
          onSelect={onSelectCharacter}
          onRequestPreview={onRequestPreview}
        />
      </div>

      {showPalette && (
        <div className="content-picker-section content-picker-palette">
          <SectionHeading eyebrow="Optional" title="Character colors" />
          <div className="content-picker-palette-groups">
            {paletteGroups.map((group) => (
              <fieldset key={group.key}>
                <legend>{group.label}</legend>
                <div className="content-picker-swatches">
                  {group.swatches.map((swatch) => (
                    <button
                      key={`${group.key}:${swatch.value}`}
                      type="button"
                      className="content-picker-swatch"
                      style={{ '--content-picker-swatch': swatch.value } as CSSProperties}
                      aria-label={`Set ${group.label} to ${swatch.label}`}
                      aria-pressed={palette[group.key] === swatch.value}
                      title={swatch.label}
                      onClick={() => onPaletteChange?.(
                        updateCharacterPalette(palette, group.key, swatch.value),
                      )}
                    >
                      <span aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

export default ContentPicker
