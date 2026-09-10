import { useId, useRef } from 'react'
import type { CSSProperties, KeyboardEvent, MutableRefObject, ReactNode } from 'react'
import type { CharacterPalette } from '../characters/types'
import type { CharacterDescriptor, EnvironmentDescriptor } from '../registries'
import type { CharacterId, EnvironmentId } from '../types'
import { PreviewArtwork } from './PreviewArtwork'
import { updateCharacterPalette } from './selection'
import './content-picker.css'

export type ContentPreviewKind = 'environment' | 'character'
export type ContentPreviewReason = 'hover' | 'focus' | 'selection'
export type ContentPreviewStatus = 'ready' | 'loading' | 'unavailable'

export type ContentPreviewStatuses = {
  environment?: Readonly<Partial<Record<EnvironmentId, ContentPreviewStatus>>>
  character?: Readonly<Partial<Record<CharacterId, ContentPreviewStatus>>>
}

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
  /** Optional async availability state for a descriptor's lazy 3D preview. */
  previewStatuses?: ContentPreviewStatuses
  palette?: Readonly<CharacterPalette>
  paletteGroups?: readonly CharacterPaletteGroup[]
  onPaletteChange?: (palette: CharacterPalette) => void
  title?: string
  description?: string
  /** Hosts that provide their own labelled chrome (e.g. WorldAndCharacterSheet) hide the built-in header; `title` then labels the region invisibly. */
  hideHeader?: boolean
  /** Lets a host expose Scene and Character as clear tabs without duplicating picker logic. */
  visibleSection?: 'all' | 'environment' | 'character'
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
  previewStatuses?: Readonly<Partial<Record<EnvironmentId | CharacterId, ContentPreviewStatus>>>
  palette?: Readonly<CharacterPalette>
}

function moveSelection<T extends PickerCard>(
  event: KeyboardEvent<HTMLButtonElement>,
  index: number,
  descriptors: readonly T[],
  buttonRefs: MutableRefObject<Array<HTMLButtonElement | null>>,
  onSelect: (id: T['id']) => void,
  onRequest: (id: T['id']) => void,
  isUnavailable: (id: T['id']) => boolean,
) {
  if (!descriptors.length) return

  let nextIndex: number | null = null
  const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown'
    ? 1
    : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
      ? -1
      : 0
  if (direction) {
    for (let offset = 1; offset <= descriptors.length; offset += 1) {
      const candidate = (index + (direction * offset) + descriptors.length) % descriptors.length
      if (!isUnavailable(descriptors[candidate].id)) {
        nextIndex = candidate
        break
      }
    }
  }
  if (event.key === 'Home') nextIndex = descriptors.findIndex(({ id }) => !isUnavailable(id))
  if (event.key === 'End') {
    for (let candidate = descriptors.length - 1; candidate >= 0; candidate -= 1) {
      if (!isUnavailable(descriptors[candidate].id)) {
        nextIndex = candidate
        break
      }
    }
  }
  if (nextIndex === -1) nextIndex = null
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
  previewStatuses,
  palette,
}: SelectionGridProps<T>) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = descriptors.findIndex(({ id }) => (
    id === selectedId && previewStatuses?.[id] !== 'unavailable'
  ))
  const rovingIndex = selectedIndex >= 0
    ? selectedIndex
    : descriptors.findIndex(({ id }) => previewStatuses?.[id] !== 'unavailable')

  if (!descriptors.length) return <p className="content-picker-empty">{emptyCopy}</p>

  return (
    <div className="content-picker-grid" role="radiogroup" aria-label={label}>
      {descriptors.map((descriptor, index) => {
        const selected = descriptor.id === selectedId
        const previewStatus = previewStatuses?.[descriptor.id] ?? 'ready'
        const unavailable = previewStatus === 'unavailable'
        const statusLabel = previewStatus === 'loading'
          ? 'Loading preview'
          : unavailable
            ? 'Unavailable'
            : null
        const requestPreview = (reason: ContentPreviewReason) => {
          if (unavailable) return
          onRequestPreview?.(kind, descriptor.id, reason)
        }
        const select = () => {
          if (unavailable) return
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
            aria-label={`${descriptor.name}. ${descriptor.description}${statusLabel ? `. ${statusLabel}` : ''}`}
            aria-busy={previewStatus === 'loading' || undefined}
            aria-disabled={unavailable || undefined}
            data-preview-status={previewStatus}
            tabIndex={!unavailable && index === rovingIndex ? 0 : -1}
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
              (id) => previewStatuses?.[id] === 'unavailable',
            )}
          >
            <PreviewArtwork kind={kind} previewKey={descriptor.previewKey} palette={selected ? palette : undefined} />
            {statusLabel && (
              <span className="content-picker-card-status">
                {statusLabel}
              </span>
            )}
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
  previewStatuses,
  palette = {},
  paletteGroups = [],
  onPaletteChange,
  title = 'Scene & character',
  description = 'Choose a setting for your world and a character to explore it as.',
  hideHeader = false,
  visibleSection = 'all',
  className,
}: ContentPickerProps) {
  const headingId = useId()
  const selectedCharacter = characterDescriptors.find(({ id }) => id === selectedCharacterId)
  const showPalette = Boolean(selectedCharacter?.customizable && paletteGroups.length && onPaletteChange)

  return (
    <section
      className={['content-picker', className].filter(Boolean).join(' ')}
      aria-labelledby={hideHeader ? undefined : headingId}
      aria-label={hideHeader ? title : undefined}
    >
      {!hideHeader && (
        <header className="content-picker-heading">
          <span className="content-picker-eyebrow">Make it yours</span>
          <h2 id={headingId}>{title}</h2>
          <p>{description}</p>
        </header>
      )}

      {(visibleSection === 'all' || visibleSection === 'environment') && <div className="content-picker-section">
        <SectionHeading eyebrow="Your setting" title="Scene">
          <span className="content-picker-selection-summary" aria-live="polite">
            {environmentDescriptors.find(({ id }) => id === selectedEnvironmentId)?.name ?? 'Not selected'}
          </span>
        </SectionHeading>
        <SelectionGrid
          kind="environment"
          label="Choose a scene"
          descriptors={environmentDescriptors}
          selectedId={selectedEnvironmentId}
          emptyCopy="No scenes are available yet."
          onSelect={onSelectEnvironment}
          onRequestPreview={onRequestPreview}
          previewStatuses={previewStatuses?.environment}
        />
      </div>}

      {(visibleSection === 'all' || visibleSection === 'character') && <div className="content-picker-section">
        <SectionHeading eyebrow="Your explorer" title="Character">
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
          previewStatuses={previewStatuses?.character}
          palette={palette}
        />
      </div>}

      {visibleSection !== 'environment' && showPalette && (
        <div className="content-picker-section content-picker-palette">
          <SectionHeading eyebrow="Make it yours" title="Character colors">
            <button
              type="button"
              className="content-picker-reset"
              disabled={!Object.keys(palette).length}
              onClick={() => onPaletteChange?.({})}
            >Reset colors</button>
          </SectionHeading>
          <p className="content-picker-hint">Choose colors below. Switch to Explore to meet your character.</p>
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
