import { useId, type CSSProperties } from 'react'
import { CHARACTER_APPEARANCE_OPTIONS, normalizeCharacterAppearance, type CharacterAppearance } from '@brick-studio/core'
import { Button } from '../../ui'
import { LockToggle } from './PaletteControls'
import { APPEARANCE_CATEGORIES, type StudioLocks, type AppearanceCategory } from './studioMix'

import './appearance-controls.css'

export { randomizeCharacterAppearance } from './studioMix'

const LABELS: Record<string, string> = {
  classic: 'Classic', broad: 'Broad', slim: 'Slim', friendly: 'Smile', freckles: 'Freckles', rosy: 'Rosy cheeks',
  cap: 'Cap', short: 'Swept hair', curls: 'Curls', bun: 'Bun', none: 'None',
  explorer: 'Explorer', overalls: 'Overalls', sport: 'Sport', glasses: 'Glasses', backpack: 'Backpack',
}

/** Preset tones; any other value still comes through the custom picker and normalizes the same way. */
export const SKIN_TONES = [
  { value: '#f7dcc4', label: 'Porcelain' }, { value: '#f0bd86', label: 'Sand' }, { value: '#d9a06b', label: 'Honey' },
  { value: '#b87a4e', label: 'Caramel' }, { value: '#8d5a3a', label: 'Cocoa' }, { value: '#5b3a29', label: 'Espresso' },
] as const
export const HAIR_COLORS = [
  { value: '#593c2e', label: 'Chestnut' }, { value: '#2b2117', label: 'Black' }, { value: '#f2d16b', label: 'Blonde' },
  { value: '#c8532d', label: 'Auburn' }, { value: '#9a9aa0', label: 'Silver' }, { value: '#5888da', label: 'Cornflower' },
] as const

function toLongHex(color: string) {
  return color.length === 4 ? `#${color.slice(1).split('').map(c => c + c).join('')}` : color
}

export type AppearanceSection = 'head' | 'outfit' | 'colors' | 'extras'

const SECTIONS: Record<AppearanceSection, readonly AppearanceCategory[]> = {
  head: ['face', 'hair'], outfit: ['body', 'outfit'], colors: [], extras: ['accessory'],
}

/** Small illustrations describe actual supported options without mounting another 3D renderer. */
function ChoiceIllustration({ category, value, skin, hair }: { category: AppearanceCategory; value: string; skin: string; hair: string }) {
  const head = category === 'face' || category === 'hair'
  return <svg className="appearance-option__art" viewBox="0 0 96 72" aria-hidden="true" focusable="false">
    <ellipse cx="48" cy="65" rx="27" ry="4" fill="#dfe4ec" />
    {head ? <>
      <path d="M23 65q3-18 25-18t25 18" fill="#5888da" />
      <rect x="29" y="13" width="38" height="39" rx="16" fill={skin} />
      <circle cx="40" cy="34" r="2" fill="#263c51" /><circle cx="56" cy="34" r="2" fill="#263c51" />
      <path d="M42 42q6 6 12 0" fill="none" stroke="#263c51" strokeWidth="2" strokeLinecap="round" />
      {value === 'rosy' && <><ellipse cx="35" cy="40" rx="5" ry="3" fill="#e88f85" /><ellipse cx="61" cy="40" rx="5" ry="3" fill="#e88f85" /></>}
      {value === 'freckles' && <g fill="#a76b49">{[34, 38, 58, 62].map((x, i) => <circle key={x} cx={x} cy={39 + i % 2 * 3} r="1.2" />)}</g>}
      {value === 'cap' && <><path d="M26 25v-5q1-15 22-15t22 20" fill="#5888da" /><path d="M26 23h48q6 0 5 6H26z" fill="#355ca8" /></>}
      {value === 'short' && <path d="M28 30V18Q31 4 52 7q17 1 17 20L57 17 29 27z" fill={hair} />}
      {value === 'curls' && <g fill={hair}>{[30, 39, 49, 59, 67].map((x, i) => <circle key={x} cx={x} cy={19 - Math.sin(i / 4 * Math.PI) * 8} r="8" />)}</g>}
      {value === 'bun' && <g fill={hair}><circle cx="48" cy="8" r="8" /><path d="M28 27V19q2-15 20-15t20 15v8L54 16 30 28z" /></g>}
    </> : category === 'accessory' ? <>
      {value === 'glasses' && <g fill="none" stroke="#263c51" strokeWidth="4"><rect x="17" y="25" width="26" height="22" rx="7" /><rect x="53" y="25" width="26" height="22" rx="7" /><path d="M43 32h10M10 29h7m62 0h7" /></g>}
      {value === 'backpack' && <><rect x="35" y="10" width="26" height="20" rx="9" fill="none" stroke="#b55e44" strokeWidth="5" /><rect x="24" y="20" width="48" height="44" rx="12" fill="#f17861" /><rect x="32" y="39" width="32" height="19" rx="6" fill="#d3614c" /><path d="M37 43h22" stroke="#ffe4ac" strokeWidth="3" /></>}
      {value === 'none' && <g fill="none" stroke="#9ba8b8" strokeWidth="3"><circle cx="48" cy="34" r="21" /><path d="m33 49 30-30" /></g>}
    </> : <g transform={value === 'broad' ? 'translate(-9 0) scale(1.19 1)' : value === 'slim' ? 'translate(9 0) scale(.81 1)' : undefined}>
      <path d="m32 14-17 9-5 22 13 4 6-15v29h38V34l6 15 13-4-5-22-17-9-16 7z" fill="#5888da" />
      <path d="m36 13 12 8 12-8" fill="none" stroke="#f3ca74" strokeWidth="5" />
      {value === 'explorer' && <><path d="M48 23v39" stroke="#f3ca74" strokeWidth="2" /><rect x="33" y="33" width="10" height="10" rx="2" fill="#355ca8" /><rect x="53" y="33" width="10" height="10" rx="2" fill="#355ca8" /></>}
      {value === 'overalls' && <><path d="M32 15h7v17h18V15h7v48H32z" fill="#263c51" /><rect x="41" y="39" width="14" height="12" rx="2" fill="#48627b" /></>}
      {value === 'sport' && <><path d="m29 28 38 17v8L29 36z" fill="#f3ca74" /><path d="M18 24 14 42m64-18 4 18" stroke="#f3ca74" strokeWidth="3" /></>}
    </g>}
  </svg>
}

export type AppearanceControlsProps = {
  section?: AppearanceSection
  appearance?: CharacterAppearance
  locked: StudioLocks
  onToggleLock: (category: string) => void
  onChange: (appearance: CharacterAppearance) => void
}

/** Toy Figure categories: body, face, hair & hats, outfit, accessory, then skin tone and hair color. */
export function AppearanceControls({ appearance, locked, onToggleLock, onChange, section }: AppearanceControlsProps) {
  const current = normalizeCharacterAppearance(appearance)
  const idBase = useId()
  const colorRow = (key: 'skinColor' | 'hairColor', label: string, presets: readonly { value: string; label: string }[]) => (
    <div role="group" aria-labelledby={`${idBase}-${key}`} className="appearance-category appearance-category--colors">
      <div className="character-category__header"><span id={`${idBase}-${key}`} className="character-category__label">{label}</span></div>
      <div className="character-colors__swatches">
        {presets.map((preset) => (
          <button
            key={preset.value}
            type="button"
            className="character-swatch"
            style={{ '--character-swatch': preset.value } as CSSProperties}
            aria-label={`Set ${label.toLowerCase()} to ${preset.label}`}
            aria-pressed={current[key] === preset.value}
            title={preset.label}
            onClick={() => onChange({ ...current, [key]: preset.value })}
          ><span aria-hidden="true" /></button>
        ))}
        <label className="character-swatch character-swatch--custom" title={`Custom ${label.toLowerCase()}`}>
          <input
            type="color"
            aria-label={`Custom ${label.toLowerCase()}`}
            value={toLongHex(current[key])}
            onChange={event => onChange({ ...current, [key]: event.target.value })}
          />
        </label>
      </div>
    </div>
  )
  return (
    <section className="appearance-controls" aria-label="Customize your figure">
      {!section && <div className="character-studio__heading">
        <div><h3>Your figure</h3><p>Choose a look for each part. Lock a part to keep it when you mix.</p></div>
      </div>}
      {APPEARANCE_CATEGORIES.filter(({ key }) => !section || SECTIONS[section].includes(key)).map(({ key, label }) => {
        const isLocked = locked.has(key)
        return (
          <div key={key} role="group" aria-labelledby={`${idBase}-${key}`} className="appearance-category" data-locked={isLocked || undefined}>
            <div className="character-category__header">
              <span id={`${idBase}-${key}`} className="character-category__label">{label}</span>
              <LockToggle label={label.toLowerCase()} locked={isLocked} onToggle={() => onToggleLock(key)} />
            </div>
            <div className="appearance-options">
              {/* Toggle buttons on purpose: the QA harness drives these by name + aria-pressed. */}
              {CHARACTER_APPEARANCE_OPTIONS[key].map(value => (
                <Button key={value} variant="secondary" size="sm" className="appearance-option" aria-pressed={current[key] === value} onClick={() => onChange({ ...current, [key]: value })}><ChoiceIllustration category={key} value={value} skin={current.skinColor} hair={current.hairColor} /><span className="appearance-option__label">{LABELS[value]}</span></Button>
              ))}
            </div>
          </div>
        )
      })}
      {(!section || section === 'head' || section === 'colors') && colorRow('skinColor', 'Skin tone', SKIN_TONES)}
      {(!section || section === 'head' || section === 'colors') && colorRow('hairColor', 'Hair color', HAIR_COLORS)}
    </section>
  )
}

export default AppearanceControls
