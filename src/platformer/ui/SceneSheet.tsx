import { Check, Lock } from 'lucide-react'
import { useMemo } from 'react'
import { THEMES, type LevelDesign, type Theme } from '@brick-studio/platformer-core/engine/level'
import { Sheet } from '../../ui'
import { levelThumb } from './thumbs'

const SCENES: Record<Theme, { label: string; blurb: string }> = {
  day: { label: 'Day', blurb: 'Blue sky, grass and hills' },
  underground: { label: 'Underground', blurb: 'Dark caves and stone' },
}

let opened = 0

interface Props {
  open: boolean
  onClose: () => void
  design: LevelDesign
  /** Why the scene cannot be changed here (a look-only room, building locked), if it cannot. */
  lockedReason: string | null
  onPick: (theme: Theme) => void
}

/** The header's Scene: how the level looks, shown as the level itself in each scene. */
export function SceneSheet({ open, onClose, design, lockedReason, onPick }: Props) {
  // Fresh pictures each time the sheet opens, so they show the level as it is now.
  const pictures = useMemo(() => {
    if (!open) return null
    const n = ++opened
    return Object.fromEntries(THEMES.map((theme) => [theme, levelThumb({ ...design, theme }, `scene:${n}:${theme}`)])) as Record<Theme, string>
    // The design is read when the sheet opens; later edits show the next time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  return (
    <Sheet open={open} onClose={onClose} title="Scene" description="How this level looks. Everyone who plays it sees the same scene." variant="dialog" size="md" className="p2d-menu">
      <div className="p2d-scenes" role="radiogroup" aria-label="Scene">
        {THEMES.map((theme) => {
          const selected = design.theme === theme
          return (
            <button
              key={theme}
              type="button"
              role="radio"
              aria-checked={selected}
              className="p2d-scene"
              disabled={!!lockedReason && !selected}
              onClick={() => {
                if (!selected) onPick(theme)
                onClose()
              }}
            >
              {pictures && <img src={pictures[theme]} alt="" draggable={false} />}
              <span className="p2d-scene-text">
                <strong>{SCENES[theme].label}</strong>
                <span>{SCENES[theme].blurb}</span>
              </span>
              {selected && (
                <span className="p2d-scene-check" aria-hidden="true">
                  <Check size={16} />
                </span>
              )}
            </button>
          )
        })}
      </div>
      {lockedReason && (
        <p className="p2d-note">
          <Lock size={16} aria-hidden="true" /> {lockedReason}
        </p>
      )}
    </Sheet>
  )
}
