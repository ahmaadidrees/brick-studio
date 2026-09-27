import { useState } from 'react'
import { Button, Sheet } from '../../../ui'
import type { BrickDef } from '../bricks/builtins'
import { RECIPES, type RecipeId } from '../bricks/recipes'
import { NAME_WORDS, type NameWord } from '../level/doc'
import { COSTUME_LABELS } from '../program/catalog'
import { COSTUMES, type Costume } from '../program/types'
import { BrickIcon } from './parts'
import { costumeIcon } from './previews'

/** "Add a brick": every brick there is, and making a new one. */
export function LibrarySheet({ open, bricks, onClose, onPick, onNew }: { open: boolean; bricks: BrickDef[]; onClose: () => void; onPick: (id: string) => void; onNew: () => void }) {
  const builtins = bricks.filter((b) => b.origin !== 'mine' && b.id !== 'you')
  const mine = bricks.filter((b) => b.origin === 'mine')
  const card = (b: BrickDef) => (
    <li key={b.id}>
      <button type="button" className="lab-card" onClick={() => onPick(b.id)}>
        <BrickIcon def={b} size={48} />
        <span className="lab-card-text">
          <strong>{b.name}</strong>
          <span>{b.blurb}</span>
        </span>
        <span className="lab-card-go">Put it in</span>
      </button>
    </li>
  )
  return (
    <Sheet open={open} onClose={onClose} title="Add a brick" description="Pick one to put in your level. Every brick is code you can open." size="lg">
      {mine.length > 0 && (
        <>
          <h3 className="lab-sheet-h">Your bricks</h3>
          <ul className="lab-cards">{mine.map(card)}</ul>
        </>
      )}
      <h3 className="lab-sheet-h">Built-in bricks</h3>
      <ul className="lab-cards">
        {builtins.map(card)}
        <li>
          <button type="button" className="lab-card lab-card-new" onClick={onNew}>
            <span className="lab-icon lab-icon-plus" aria-hidden="true">
              +
            </span>
            <span className="lab-card-text">
              <strong>Make a new brick</strong>
              <span>Pick how it looks, then give it code.</span>
            </span>
            <span className="lab-card-go">Start</span>
          </button>
        </li>
      </ul>
    </Sheet>
  )
}

/** "I want to…": the five examples. */
export function RecipesSheet({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (id: RecipeId) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="I want to…" description="Each one is made of the same blocks you have. Open it, try it, change it." size="lg">
      <ul className="lab-recipes">
        {RECIPES.map((r) => (
          <li key={r.id} className="lab-recipe">
            <div>
              <strong className="lab-recipe-want">…{r.want}</strong>
              <p>{r.tryIt}</p>
              <ul className="lab-uses" aria-label="Blocks it uses">
                {r.uses.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </div>
            <Button variant="primary" onClick={() => onPick(r.id)}>
              Show me
            </Button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}

function WordPicker({ value, onChange }: { value: NameWord | null; onChange: (w: NameWord) => void }) {
  return (
    <div className="lab-words" role="radiogroup" aria-label="Pick a name">
      {NAME_WORDS.map((w) => (
        <button key={w} type="button" role="radio" aria-checked={value === w} className={value === w ? 'on' : undefined} onClick={() => onChange(w)}>
          {w}
        </button>
      ))}
    </div>
  )
}

/** Save a brick's code as a brick of its own, with a picked name. */
export function SaveBrickSheet({ open, def, noun, onClose, onSave }: { open: boolean; def: BrickDef | undefined; noun: string; onClose: () => void; onSave: (w: NameWord) => void }) {
  const [word, setWord] = useState<NameWord | null>(null)
  if (!def) return null
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Save as a new brick"
      description={`Pick a name. Your ${def.name}s in the level become this brick${def.origin === 'copy' ? ', and the built-in one goes back to how it was' : ''}.`}
      variant="dialog"
      footer={
        <Button variant="primary" disabled={!word} onClick={() => word && onSave(word)}>
          {word ? `Save ${word} ${noun}` : 'Pick a name first'}
        </Button>
      }
    >
      <div className="lab-name-preview">
        <BrickIcon def={def} size={48} />
        <strong>{word ? `${word} ${noun}` : `… ${noun}`}</strong>
      </div>
      <WordPicker value={word} onChange={setWord} />
    </Sheet>
  )
}

const NEW_COSTUMES: Costume[] = COSTUMES.filter((c) => c !== 'hero' && c !== 'walkerFlat' && c !== 'springDown' && c !== 'usedBlock' && c !== 'rocketFire')

/** Make a brand-new brick: a costume and a picked name. */
export function NewBrickSheet({ open, onClose, onMake }: { open: boolean; onClose: () => void; onMake: (c: Costume, w: NameWord | null) => void }) {
  const [costume, setCostume] = useState<Costume>('crate')
  const [word, setWord] = useState<NameWord | null>(null)
  const noun = COSTUME_LABELS[costume].replace(/^\? /, '').split(' ').map((s) => s[0].toUpperCase() + s.slice(1)).join(' ')
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Make a new brick"
      description="Pick how it looks and a name. It starts with no code: you give it some."
      size="lg"
      footer={
        <Button variant="primary" onClick={() => onMake(costume, word)}>
          Make {word ? `${word} ${noun}` : noun}
        </Button>
      }
    >
      <h3 className="lab-sheet-h">How it looks</h3>
      <div className="lab-costumes" role="radiogroup" aria-label="Costume">
        {NEW_COSTUMES.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={costume === c} className={costume === c ? 'on' : undefined} onClick={() => setCostume(c)} title={COSTUME_LABELS[c]}>
            <img src={costumeIcon(c)} alt="" width={44} height={44} />
            <span>{COSTUME_LABELS[c]}</span>
          </button>
        ))}
      </div>
      <h3 className="lab-sheet-h">Its name</h3>
      <WordPicker value={word} onChange={setWord} />
    </Sheet>
  )
}
