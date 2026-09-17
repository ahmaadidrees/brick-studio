import { Sparkles, Undo2 } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '../../ui'
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
  const id = useId()
  const [page, setPage] = useState<'characters' | 'customize' | 'looks'>('characters')
  const [section, setSection] = useState<'head' | 'outfit' | 'colors' | 'extras'>('head')
  const [beforeMix, setBeforeMix] = useState<ContentPickerSelection | null>(null)
  const [locked, setLocked] = useState<Set<string>>(() => new Set())
  const selected = characterDescriptors.find(({ id }) => id === draft.characterId)
  const customizable = Boolean(selected?.customizable)
  const showColors = customizable && paletteGroups.length > 0
  const showFigure = draft.characterId === 'toy-figure'
  const mixable = canMixDraft(draft, { locked, paletteGroups, customizable })
  const onToggleLock = (key: string) => setLocked(current => toggleLock(current, key))

  const activeSection = showFigure ? section : 'colors'
  const edit = (next: ContentPickerSelection) => { setBeforeMix(null); onDraftChange(next) }
  const pages = [['characters', 'Characters'], ['customize', 'Customize'], ['looks', 'My looks']] as const

  return (
    <div className="character-studio">
      <div className="character-studio__presentation">
        <header className="character-studio__intro">
          <h3>{selected?.name ?? 'Your character'}</h3>
          <p>A little more you. Try a look before you use it.</p>
        </header>
        <CharacterPreview focus={page === 'customize' && activeSection === 'head' ? 'head' : 'body'} characterId={draft.characterId} palette={draft.palette} appearance={draft.appearance} />
      </div>
      <div className="character-studio__customization">
        <div className="character-studio__navigation" role="tablist" aria-label="Character Studio">
          {pages.map(([key, label], index) => <button type="button" role="tab" key={key}
            id={`${id}-${key}`} aria-controls={`${id}-panel`} aria-selected={page === key} tabIndex={page === key ? 0 : -1}
            onClick={() => setPage(key)} onKeyDown={event => {
              const next = event.key === 'ArrowRight' ? (index + 1) % pages.length : event.key === 'ArrowLeft' ? (index + pages.length - 1) % pages.length : event.key === 'Home' ? 0 : event.key === 'End' ? pages.length - 1 : -1
              if (next < 0) return
              event.preventDefault(); setPage(pages[next][0]); document.getElementById(`${id}-${pages[next][0]}`)?.focus()
            }}>{label}</button>)}
        </div>
        <div className="character-studio__panel" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${page}`}>
        {page === 'characters' && <ContentPicker
          hideHeader
          visibleSection="character"
          environmentDescriptors={NO_ENVIRONMENTS}
          characterDescriptors={characterDescriptors}
          selectedEnvironmentId={draft.environmentId}
          selectedCharacterId={draft.characterId}
          onSelectEnvironment={ignoreEnvironment}
          onSelectCharacter={(characterId: CharacterId) => edit({ ...draft, characterId })}
          palette={draft.palette}
          onRequestPreview={onRequestPreview}
          previewStatuses={previewStatuses}
        />}
        {page === 'customize' && <>
        {showFigure && <div className="character-studio__sections" role="group" aria-label="Customize categories">
          {(['head', 'outfit', 'colors', 'extras'] as const).map(key => <button type="button" key={key} aria-pressed={activeSection === key} onClick={() => setSection(key)}>{key[0].toUpperCase() + key.slice(1)}</button>)}
        </div>}
        {!showFigure && !showColors && <div className="character-studio__empty"><h3>Ready for adventure</h3><p>{selected?.name ?? 'This character'} has a signature look. Choose another character to try different colors and styles.</p><Button onClick={() => setPage('characters')}>Choose a character</Button></div>}
        {showFigure && activeSection !== 'colors' && (
          <AppearanceControls
            section={activeSection}
            appearance={draft.appearance}
            locked={locked}
            onToggleLock={onToggleLock}
            onChange={appearance => edit({ ...draft, appearance })}
          />
        )}
        {showColors && activeSection === 'colors' && (
          <PaletteControls
            groups={paletteGroups}
            palette={draft.palette}
            locked={locked}
            onToggleLock={onToggleLock}
            onChange={palette => edit({ ...draft, palette })}
          />
        )}
        {showColors && activeSection === 'colors' && <LookColors palette={draft.palette} locked={locked} onChange={palette => edit({ ...draft, palette })} />}
        {(showColors || showFigure) && (
          <div className="character-studio__mix">
            <Button
              variant="primary"
              icon={<Sparkles size={16} />}
              disabled={!mixable}
              onClick={() => { setBeforeMix(draft); onDraftChange(mixDraft(draft, { locked, paletteGroups, customizable })) }}
            >Mix it up</Button>
            {beforeMix && <Button icon={<Undo2 size={16} />} onClick={() => { onDraftChange(beforeMix); setBeforeMix(null) }}>Undo mix</Button>}
            <p>{mixable ? 'Shuffles every part you have not kept. Locked choices, skin tone and hair color stay the same.' : 'Everything is kept. Unlock a part to mix it.'}</p>
          </div>
        )}
      </>}
      {page === 'looks' && draft.characterId && (
        <WardrobePanel
          appearance={{ characterId: draft.characterId, palette: draft.palette, appearance: draft.appearance }}
          characterDescriptors={characterDescriptors}
          onChoose={appearance => edit({ ...draft, ...appearance })}
        />
      )}
      </div>
      </div>
    </div>
  )
}

export default CharacterStudio
