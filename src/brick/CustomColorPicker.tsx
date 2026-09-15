import { useRef, useState } from 'react'
import { Button, Dialog, TextField } from '../ui'
import './custom-color-picker.css'

export type HsvColor = { h: number; s: number; v: number }
export function hsvToHex({ h, s, v }: HsvColor): string {
  const channel = (n: number) => {
    const k = (n + h / 60) % 6
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255).toString(16).padStart(2, '0')
  }
  return `#${channel(5)}${channel(3)}${channel(1)}`
}
export function hexToHsv(hex: string): HsvColor {
  const expanded = /^#[\da-f]{3}$/i.test(hex) ? `#${[...hex.slice(1)].map((digit) => digit + digit).join('')}` : hex
  const normalized = /^#[\da-f]{6}$/i.test(expanded) ? expanded : '#ffffff'
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min
  const hue = delta === 0 ? 0 : max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
  return { h: (hue * 60 + 360) % 360, s: max === 0 ? 0 : delta / max, v: max }
}

const HEX_PATTERN = /^#[\da-f]{6}$/i
export const HEX_MESSAGE = 'Enter # followed by six letters A–F or digits, such as #38a8e8.'

export type CustomColorPickerProps = {
  color: string
  onApply: (color: string) => void
  onClose: () => void
}

/**
 * "Choose any color" (board 10): a compact child dialog opened from the brick
 * drawer's color grid. It edits locally (wheel, sliders, hex) and commits
 * exactly once on Apply; Cancel, Escape and the backdrop return to the parent
 * with focus restored to the "Choose any brick color" button. It stacks above
 * the drawer sheet, never as a second full-screen modal.
 */
export function CustomColorPicker({ color, onApply, onClose }: CustomColorPickerProps) {
  const [hsv, setHsv] = useState(() => hexToHsv(color))
  const [hex, setHex] = useState(() => hsvToHex(hexToHsv(color)))
  const activePointer = useRef<number | null>(null)
  const valid = HEX_PATTERN.test(hex)
  const preview = hsvToHex(hsv)
  const update = (next: HsvColor) => { setHsv(next); setHex(hsvToHex(next)) }
  const wheelPoint = (element: HTMLDivElement, x: number, y: number) => {
    const rect = element.getBoundingClientRect(), dx = x - rect.left - rect.width / 2, dy = y - rect.top - rect.height / 2
    update({ ...hsv, h: (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360 })
  }
  const squarePoint = (element: HTMLDivElement, x: number, y: number) => {
    const rect = element.getBoundingClientRect()
    update({ ...hsv, s: Math.max(0, Math.min(1, (x - rect.left) / rect.width)), v: 1 - Math.max(0, Math.min(1, (y - rect.top) / rect.height)) })
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title="Choose any color"
      description="Choose a hue on the ring, then a shade in the square."
      closeLabel="Close color picker"
      className="brick-color-dialog"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid} onClick={() => { onApply(hex.toLowerCase()); onClose() }}>Apply color</Button>
        </>
      )}
    >
      <div className="brick-color-layout">
        <div className="brick-color-spectrum">
        <div
          className="brick-color-wheel"
          role="img"
          aria-label="Color wheel. The hue, saturation and brightness sliders below offer the same controls."
          onPointerDown={(event) => { if (event.button !== 0 || activePointer.current !== null) return; event.preventDefault(); activePointer.current = event.pointerId; event.currentTarget.setPointerCapture?.(event.pointerId); wheelPoint(event.currentTarget, event.clientX, event.clientY) }}
          onPointerMove={(event) => { if (activePointer.current === event.pointerId) wheelPoint(event.currentTarget, event.clientX, event.clientY) }}
          onPointerUp={(event) => { if (activePointer.current === event.pointerId) { activePointer.current = null; event.currentTarget.releasePointerCapture?.(event.pointerId) } }}
          onPointerCancel={() => { activePointer.current = null }}
          onLostPointerCapture={() => { activePointer.current = null }}
        >
          <span className="brick-color-wheel-thumb" style={{ left: `${50 + Math.sin(hsv.h * Math.PI / 180) * 44}%`, top: `${50 - Math.cos(hsv.h * Math.PI / 180) * 44}%`, background: hsvToHex({ h: hsv.h, s: 1, v: 1 }) }} />
        </div>
        <div
          className="brick-color-square"
          role="img"
          aria-label="Color shade. The saturation and brightness sliders below offer the same controls."
          style={{ backgroundColor: hsvToHex({ h: hsv.h, s: 1, v: 1 }) }}
          onPointerDown={(event) => { if (event.button !== 0 || activePointer.current !== null) return; event.preventDefault(); activePointer.current = event.pointerId; event.currentTarget.setPointerCapture?.(event.pointerId); squarePoint(event.currentTarget, event.clientX, event.clientY) }}
          onPointerMove={(event) => { if (activePointer.current === event.pointerId) squarePoint(event.currentTarget, event.clientX, event.clientY) }}
          onPointerUp={(event) => { if (activePointer.current === event.pointerId) { activePointer.current = null; event.currentTarget.releasePointerCapture?.(event.pointerId) } }}
          onPointerCancel={() => { activePointer.current = null }}
          onLostPointerCapture={() => { activePointer.current = null }}
        >
          <span className="brick-color-wheel-thumb" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: preview }} />
        </div>
        </div>
        <div className="brick-color-value">
          <span className="brick-color-preview" role="img" aria-label={`Color preview ${preview}`} style={{ background: preview }} />
          <TextField
            label="Hex color"
            className="brick-color-hex"
            inputClassName="brick-color-hex-input"
            spellCheck={false}
            autoComplete="off"
            maxLength={7}
            value={hex}
            error={valid ? undefined : HEX_MESSAGE}
            onChange={(event) => { const next = event.target.value; setHex(next); if (HEX_PATTERN.test(next)) setHsv(hexToHsv(next)) }}
          />
        </div>
      </div>
      <div className="brick-color-sliders">
        <label><span>Hue</span><input aria-label="Color hue" type="range" min="0" max="359" value={Math.round(hsv.h) % 360} onChange={(event) => update({ ...hsv, h: Number(event.target.value) })} /></label>
        <label><span>Saturation</span><input aria-label="Color saturation" type="range" min="0" max="100" value={Math.round(hsv.s * 100)} onChange={(event) => update({ ...hsv, s: Number(event.target.value) / 100 })} /></label>
        <label><span>Brightness</span><input aria-label="Color brightness" type="range" min="0" max="100" value={Math.round(hsv.v * 100)} onChange={(event) => update({ ...hsv, v: Number(event.target.value) / 100 })} /></label>
      </div>
    </Dialog>
  )
}
