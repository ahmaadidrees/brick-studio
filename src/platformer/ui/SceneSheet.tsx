import { Check, Lock } from 'lucide-react'
import { useMemo } from 'react'
import { STYLES, THEMES, type LevelDesign, type LevelStyle, type Theme } from '@brick-studio/platformer-core/engine/level'
import { Sheet } from '../../ui'
import { levelThumb } from './thumbs'

const LOOKS: Record<LevelStyle, { label: string; blurb: string }> = {
  cartoon: { label: 'Cartoon', blurb: 'Smooth toy bricks' },
  pixel: { label: 'Pixel', blurb: 'Retro pixel art' },
}

const SCENES: Record<Theme, { label: string; blurb: string }> = {
  day: { label: 'Day', blurb: 'Blue sky and hills' },
  underground: { label: 'Underground', blurb: 'Dark caves and stone' },
}

/** Cartoon first: it is the look new levels start in. */
const LOOK_ORDER: LevelStyle[] = ['cartoon', 'pixel']

let opened = 0

interface Props {
  open: boolean
  onClose: () => void
  design: LevelDesign
  /** Why the level's look cannot be changed here (a look-only room, building locked), if it cannot. */
  lockedReason: string | null
  onStyle: (style: LevelStyle) => void
  onTheme: (theme: Theme) => void
}

/**
 * The header's Scene: the level's look (cartoon or pixel) and its scene, each shown as the level itself. `design` is
 * the live level (the game changes it in place), so a pick compares against it, not against the last render.
 */
export function SceneSheet({ open, onClose, design, lockedReason, onStyle, onTheme }: Props) {
  const { style, theme } = design
  // Fresh pictures whenever the sheet opens or a choice changes, so they show the level as it is now.
  const pictures = useMemo(() => {
    if (!open) return null
    const n = ++opened
    return {
      looks: Object.fromEntries(STYLES.map((s) => [s, levelThumb({ ...design, style: s }, `look:${n}:${s}`)])) as Record<LevelStyle, string>,
      scenes: Object.fromEntries(THEMES.map((t) => [t, levelThumb({ ...design, theme: t }, `scene:${n}:${t}`)])) as Record<Theme, string>,
    }
    // The design's tiles are read when the sheet opens; later edits show the next time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, style, theme])
  return (
    <Sheet open={open} onClose={onClose} title="Scene" description="How this world looks. Everyone who plays it sees the same." variant="dialog" size="md" className="p2d-menu">
      <div className="p2d-menu-body">
        <section className="p2d-scene-group" aria-labelledby="p2d-look-title">
          <h3 id="p2d-look-title">Look</h3>
          <div className="p2d-scenes" role="radiogroup" aria-labelledby="p2d-look-title">
            {LOOK_ORDER.map((s) => (
              <Choice key={s} label={LOOKS[s].label} blurb={LOOKS[s].blurb} picture={pictures?.looks[s]} selected={style === s} disabled={!!lockedReason && style !== s} onPick={() => design.style !== s && onStyle(s)} />
            ))}
          </div>
        </section>
        <section className="p2d-scene-group" aria-labelledby="p2d-scene-title">
          <h3 id="p2d-scene-title">Scene</h3>
          <div className="p2d-scenes" role="radiogroup" aria-labelledby="p2d-scene-title">
            {THEMES.map((t) => (
              <Choice key={t} label={SCENES[t].label} blurb={SCENES[t].blurb} picture={pictures?.scenes[t]} selected={theme === t} disabled={!!lockedReason && theme !== t} onPick={() => design.theme !== t && onTheme(t)} />
            ))}
          </div>
        </section>
        {lockedReason && (
          <p className="p2d-note">
            <Lock size={16} aria-hidden="true" /> {lockedReason}
          </p>
        )}
      </div>
    </Sheet>
  )
}

function Choice({ label, blurb, picture, selected, disabled, onPick }: { label: string; blurb: string; picture?: string; selected: boolean; disabled: boolean; onPick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={selected} className="p2d-scene" disabled={disabled} onClick={onPick}>
      {picture && <img src={picture} alt="" draggable={false} />}
      <span className="p2d-scene-text">
        <strong>{label}</strong>
        <span>{blurb}</span>
      </span>
      {selected && (
        <span className="p2d-scene-check" aria-hidden="true">
          <Check size={16} />
        </span>
      )}
    </button>
  )
}
