import { AppearanceControls } from './AppearanceControls'
import { CharacterPreview } from './CharacterPreview'
import { LookColors } from './LookColors'
import { WardrobePanel } from './WardrobePanel'
import { ContentPicker } from '../contentPicker/ContentPicker'
import type { CharacterPaletteGroup, ContentPickerProps } from '../contentPicker/ContentPicker'
import type { ContentPickerSelection } from '../contentPicker/selection'
import type { CharacterDescriptor, EnvironmentDescriptor } from '../registries'
import type { CharacterId } from '../types'

/**
 * The Character tab body of the "Scene & character" sheet: live preview,
 * character cards, appearance/look controls and the wardrobe.
 *
 * Contract: fully controlled. The host owns the draft and passes every edit
 * back through `onDraftChange` with one complete selection; nothing here is
 * persisted or broadcast, and Apply/Cancel stay with the host sheet.
 */
export type CharacterStudioProps = {
  draft: ContentPickerSelection
  onDraftChange: (next: ContentPickerSelection) => void
  characterDescriptors: readonly CharacterDescriptor[]
  paletteGroups: readonly CharacterPaletteGroup[]
  /** Optional lazy-preview state shown accessibly on each character card. */
  previewStatuses?: ContentPickerProps['previewStatuses']
  /** Draft-time preview intents (hover/focus/selection); never a commitment. */
  onRequestPreview?: ContentPickerProps['onRequestPreview']
}

// The picker's scene section stays hidden here; the sheet renders it on its own tab.
const NO_ENVIRONMENTS: readonly EnvironmentDescriptor[] = []
const ignoreEnvironment = () => {}

export function CharacterStudio({
  draft,
  onDraftChange,
  characterDescriptors,
  paletteGroups,
  previewStatuses,
  onRequestPreview,
}: CharacterStudioProps) {
  return (
    <>
      <CharacterPreview characterId={draft.characterId} palette={draft.palette} appearance={draft.appearance} />
      <ContentPicker
        hideHeader
        visibleSection="character"
        environmentDescriptors={NO_ENVIRONMENTS}
        characterDescriptors={characterDescriptors}
        selectedEnvironmentId={draft.environmentId}
        selectedCharacterId={draft.characterId}
        onSelectEnvironment={ignoreEnvironment}
        onSelectCharacter={(characterId: CharacterId) => onDraftChange({ ...draft, characterId })}
        palette={draft.palette}
        paletteGroups={paletteGroups}
        onPaletteChange={(palette) => onDraftChange({ ...draft, palette })}
        onRequestPreview={onRequestPreview}
        previewStatuses={previewStatuses}
      />
      {draft.characterId === 'toy-figure' && <AppearanceControls appearance={draft.appearance} onChange={appearance => onDraftChange({ ...draft, appearance })} />}
      <LookColors palette={draft.palette} onChange={palette => onDraftChange({ ...draft, palette })} />
      {draft.characterId && <WardrobePanel
        appearance={{ characterId: draft.characterId, palette: draft.palette, appearance: draft.appearance }}
        onChoose={appearance => onDraftChange({ ...draft, ...appearance })}
      />}
    </>
  )
}

export default CharacterStudio
