import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { AppearanceControls } from './AppearanceControls'
import { CharacterPreview } from './CharacterPreview'
import { LookColors } from './LookColors'
import { PaletteControls } from './PaletteControls'
import { WardrobePanel } from './WardrobePanel'
import { canMixDraft, mixDraft, toggleLock } from './studioMix'
import { ContentPicker } from '../contentPicker/ContentPicker'
import type { CharacterPaletteGroup, ContentPickerProps } from '../contentPicker/ContentPicker'
import type { ContentPickerSelection } from '../contentPicker/selection'
import type { CharacterDescriptor, EnvironmentDescriptor } from '../registries'
import type { CharacterId } from '../types'
import './character-studio.css'

/**
 * The Character tab body of the "Scene & character" sheet: live preview,
 * character cards, appearance/color controls with locks, "Mix it up", and the
 * wardrobe.
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
  const [locked, setLocked] = useState<Set<string>>(() => new Set())
  const selected = characterDescriptors.find(({ id }) => id === draft.characterId)
  const customizable = Boolean(selected?.customizable)
  const showColors = customizable && paletteGroups.length > 0
  const mixable = canMixDraft(draft, { locked, paletteGroups, customizable })
  const onToggleLock = (key: string) => setLocked(current => toggleLock(current, key))

  return (
    <div className="character-studio">
      <header className="character-studio__intro">
        <h3>Make it yours.</h3>
        <p>Customize your character and show what kind of builder you are. Nothing changes for anyone else until you press Apply.</p>
      </header>
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
        onRequestPreview={onRequestPreview}
        previewStatuses={previewStatuses}
      />
      {draft.characterId === 'toy-figure' && (
        <AppearanceControls
          appearance={draft.appearance}
          locked={locked}
          onToggleLock={onToggleLock}
          onChange={appearance => onDraftChange({ ...draft, appearance })}
        />
      )}
      {showColors && (
        <PaletteControls
          groups={paletteGroups}
          palette={draft.palette}
          locked={locked}
          onToggleLock={onToggleLock}
          onChange={palette => onDraftChange({ ...draft, palette })}
        />
      )}
      {showColors && <LookColors palette={draft.palette} locked={locked} onChange={palette => onDraftChange({ ...draft, palette })} />}
      {(showColors || draft.characterId === 'toy-figure') && (
        <div className="character-studio__mix">
          <button
            type="button"
            className="character-studio__primary"
            disabled={!mixable}
            onClick={() => onDraftChange(mixDraft(draft, { locked, paletteGroups, customizable }))}
          ><Sparkles aria-hidden="true" size={16} /><span>Mix it up</span></button>
          <p>{mixable ? 'Shuffles every part you have not kept. Locked choices, skin tone and hair color stay the same.' : 'Everything is kept. Unlock a part to mix it.'}</p>
        </div>
      )}
      {draft.characterId && (
        <WardrobePanel
          appearance={{ characterId: draft.characterId, palette: draft.palette, appearance: draft.appearance }}
          characterDescriptors={characterDescriptors}
          onChoose={appearance => onDraftChange({ ...draft, ...appearance })}
        />
      )}
    </div>
  )
}

export default CharacterStudio
