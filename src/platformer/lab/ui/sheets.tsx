import { useState } from 'react'
import { Button, Sheet } from '../../../ui'
import { WORLD_ID, type BrickDef } from '../bricks/builtins'
import { RECIPES, type RecipeId } from '../bricks/recipes'
import { NAME_WORDS, type NameWord } from '../level/doc'
import { COSTUME_LABELS } from '../program/catalog'
import { COSTUMES, type Costume } from '../program/types'
import { BrickIcon } from './parts'
import { costumeIcon } from './previews'

/** "Add a brick": every brick there is, and making a new one. */
export function LibrarySheet({ open, bricks, onClose, onPick, onNew }: { open: boolean; bricks: BrickDef[]; onClose: () => void; onPick: (id: string) => void; onNew: () => void }) {
  const builtins = bricks.filter((b) => b.origin !== 'mine' && b.id !== 'you' && b.id !== WORLD_ID)
  const mine = bricks.filter((b) => b.origin === 'mine' && b.id !== WORLD_ID)
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

/** "I want to…": runnable examples made from the same blocks as the palette. */
export function RecipesSheet({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (id: RecipeId) => void }) {
  const featured = ['programmable-car', 'react-character']
  const recipes = [...RECIPES].sort((a, b) => Number(!featured.includes(a.id)) - Number(!featured.includes(b.id)))
  return (
    <Sheet open={open} onClose={onClose} title="I want to…" description="Each one is made of the same blocks you have. Open it, try it, change it." size="lg">
      <ul className="lab-recipes">
        {recipes.map((r) => (
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

/** Small, in-place examples for the less obvious building blocks. */
export function CodeHelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="How to make your own code" description="Drag blocks from the colored categories into a script. Tap or hover over a block for its own tip." size="lg">
      <div className="lab-code-help">
        <section>
          <h3>Remember a number</h3>
          <p>Open Variables. Set <strong>my</strong> fuel for one thing, <strong>the player’s</strong> score for the player, or <strong>the world’s</strong> coins for everyone. Type the same short name, like <strong>lapCount</strong>, on blocks that share a number.</p>
        </section>
        <section>
          <h3>Make a block you can reuse</h3>
          <p>Open My Blocks and drag out <strong>define</strong>. Give it a short name, like <strong>boost</strong>, then put steps inside it. Name up to three number inputs; leave the others blank. Drag out <strong>run my block</strong> and use the same name. Select that run block to open its definition.</p>
        </section>
        <section>
          <h3>Send a message</h3>
          <p>Open Events. <strong>Broadcast</strong> a message such as “go”, then use <strong>when I receive go</strong> to start code on this brick or another brick.</p>
        </section>
        <section>
          <h3>Choose an exact spot</h3>
          <p>Use <strong>position x/y</strong> to read where a thing is. <strong>Move to x/y</strong> and <strong>make at x/y</strong> use pixels: x goes across the stage, y goes down, and one brick is 16 pixels wide.</p>
        </section>
      </div>
    </Sheet>
  )
}

/** Two short learner journeys: draw an expressive character, then inspect a vehicle built from general blocks. */
export function AuthoringTutorialSheet({ open, onClose, onStart }: { open: boolean; onClose: () => void; onStart: (id: 'react-character' | 'programmable-car') => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Make it yours" description="Start with a small idea, try it on the stage, then open its code and change a step." size="lg">
      <div className="lab-code-help">
        <section>
          <h3>Draw a character that reacts</h3>
          <p>Open the character’s look editor and draw two costume frames. Start this example, click your character, and watch it speak and change frame. Add another frame or edit its words.</p>
          <Button variant="primary" onClick={() => onStart('react-character')}>Start character</Button>
        </section>
        <section>
          <h3>Build a car you can ride</h3>
          <p>Walk next to the car and press ↑. Its code uses a variable, key checks, and positions to carry you; ↓ puts you beside it and gives your controls back. Open the car to inspect each block.</p>
          <Button variant="primary" onClick={() => onStart('programmable-car')}>Start car</Button>
        </section>
      </div>
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
