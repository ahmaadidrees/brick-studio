import { Check, PaintBucket, Paintbrush } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { useBrickStore } from '../../brick/store'
import type { DerivedCreation } from '../model/creations'
import { PAINT_COLORS, colorName, paintRobot, sameColor, startPainting, stopPainting, usePaintMode } from './paint'
import './paint.css'

const nameOf = (color: string) => colorName(color) ?? 'your color'
const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * The robot panel's Paint row (lane P): the studio's twelve colours as big chips. Picking one
 * starts painting (whatever was picked turns that colour too); while painting, a line says what
 * a tap does, with Done, and "Paint all of <name>" paints the whole robot in one Undo.
 */
export function PaintRow({ creation }: { creation: DerivedCreation }) {
  const painting = usePaintMode((state) => state.painting)
  const color = useBrickStore((state) => state.activeColor)
  const headingId = useId()
  const section = useRef<HTMLElement>(null)
  const name = nameOf(color)
  // Painting grows the row by a line and "Paint all": scroll the panel so all of it is in sight.
  useEffect(() => {
    if (painting) section.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [painting])
  return (
    <section ref={section} className={`robotics-paint${painting ? ' painting' : ''}`} aria-labelledby={headingId} data-testid="robotics-paint">
      <h3 className="robotics-section-title" id={headingId}>Paint</h3>
      <div className="robotics-paint-chips" role="group" aria-label="Paint colors">
        {PAINT_COLORS.map((swatch) => {
          const on = painting && sameColor(swatch, color)
          const label = `Paint ${nameOf(swatch)}`
          return (
            <button key={swatch} type="button" className={`robotics-paint-chip${on ? ' on' : ''}`} aria-pressed={on} aria-label={label} title={capitalized(nameOf(swatch))} onClick={() => startPainting(swatch)} data-color={swatch}>
              <span className="robotics-paint-dot" style={{ background: swatch }} aria-hidden="true">{on && <Check size={18} strokeWidth={3} />}</span>
            </button>
          )
        })}
      </div>
      {painting && (
        <>
          <p className="robotics-paint-line" role="status" data-testid="robotics-paint-line">
            <span>Tap bricks to paint them {name}.</span>
            <button type="button" className="robotics-link-button" onClick={stopPainting}>Done</button>
          </p>
          <button type="button" className="robotics-big-button robotics-paint-all" onClick={() => paintRobot(creation.id, color)} data-testid="robotics-paint-all">
            <span className="robotics-paint-all-icon" style={{ background: color }} aria-hidden="true"><PaintBucket size={18} /></span>
            Paint all of {creation.name}
          </button>
        </>
      )}
    </section>
  )
}

/**
 * While painting, the bar at the bottom of the canvas says so in the command strip's place:
 * "Painting · Red", what a tap does, and Done (Esc works too).
 */
export function PaintBar() {
  const painting = usePaintMode((state) => state.painting)
  const color = useBrickStore((state) => state.activeColor)
  if (!painting) return null
  return (
    <div className="command-strip robotics-paint-bar" data-testid="robotics-paint-bar">
      <div className="command-strip-row" role="group" aria-label="Painting" data-state="painting">
        <span className="command-strip-chip">
          <span className="command-strip-swatch robotics-paint-swatch" style={{ background: color }} aria-hidden="true"><Paintbrush size={16} /></span>
          <span className="command-strip-chip-text"><span className="brick-eyebrow">Painting</span><strong>{capitalized(nameOf(color))}</strong></span>
        </span>
        <span className="robotics-paint-hint">Tap bricks to paint them</span>
        <div className="command-strip-actions">
          <button className="command-strip-button command-strip-primary" type="button" aria-label="Done painting" title="Stop painting (Esc)" onClick={stopPainting}><Check size={18} aria-hidden="true" /><span>Done</span></button>
        </div>
      </div>
    </div>
  )
}
