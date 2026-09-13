import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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

export function CustomColorPicker({ color, onApply, onClose }: { color: string; onApply: (color: string) => void; onClose: () => void }) {
  const [hsv, setHsv] = useState(() => hexToHsv(color))
  const [hex, setHex] = useState(() => hsvToHex(hexToHsv(color)))
  const panel = useRef<HTMLDivElement>(null)
  const activePointer = useRef<number | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const titleId = useId()
  const valid = /^#[\da-f]{6}$/i.test(hex)
  const preview = hsvToHex(hsv)
  const update = (next: HsvColor) => { setHsv(next); setHex(hsvToHex(next)) }
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closeRef.current(); return }
      if (event.key !== 'Tab') return
      const elements = [...(panel.current?.querySelectorAll<HTMLElement>('button, input') ?? [])].filter((element) => !element.hasAttribute('disabled'))
      const first = elements[0], last = elements.at(-1)
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first?.focus() }
    }
    window.addEventListener('keydown', handleKey, true)
    return () => { window.removeEventListener('keydown', handleKey, true); previous?.focus() }
  }, [])
  const wheelPoint = (element: HTMLDivElement, x: number, y: number) => {
    const rect = element.getBoundingClientRect(), dx = x - rect.left - rect.width / 2, dy = y - rect.top - rect.height / 2
    update({ ...hsv, h: (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360, s: Math.min(1, Math.hypot(dx, dy) / (rect.width / 2)) })
  }
  return createPortal(<div className="brick-color-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="brick-color-panel">
      <header><h2 id={titleId}>Choose any color</h2><button type="button" aria-label="Close color picker" onClick={onClose}>×</button></header>
      <p>Pick a color on the wheel, then adjust its brightness.</p>
      <div className="brick-color-wheel" role="img" aria-label="Color wheel. Hue and saturation sliders below offer the same controls."
        onPointerDown={(event) => { if (event.button !== 0 || activePointer.current !== null) return; event.preventDefault(); activePointer.current = event.pointerId; event.currentTarget.setPointerCapture?.(event.pointerId); wheelPoint(event.currentTarget, event.clientX, event.clientY) }}
        onPointerMove={(event) => { if (activePointer.current === event.pointerId) wheelPoint(event.currentTarget, event.clientX, event.clientY) }}
        onPointerUp={(event) => { if (activePointer.current === event.pointerId) { activePointer.current = null; event.currentTarget.releasePointerCapture?.(event.pointerId) } }}
        onPointerCancel={() => { activePointer.current = null }} onLostPointerCapture={() => { activePointer.current = null }}>
        <span style={{ left: `${50 + Math.sin(hsv.h * Math.PI / 180) * hsv.s * 50}%`, top: `${50 - Math.cos(hsv.h * Math.PI / 180) * hsv.s * 50}%` }} />
      </div>
      <div className="brick-color-sliders">
        <label>Hue<input aria-label="Color hue" type="range" min="0" max="359" value={Math.round(hsv.h) % 360} onChange={(event) => update({ ...hsv, h: Number(event.target.value) })} /></label>
        <label>Saturation<input aria-label="Color saturation" type="range" min="0" max="100" value={Math.round(hsv.s * 100)} onChange={(event) => update({ ...hsv, s: Number(event.target.value) / 100 })} /></label>
        <label>Brightness<input aria-label="Color brightness" type="range" min="0" max="100" value={Math.round(hsv.v * 100)} onChange={(event) => update({ ...hsv, v: Number(event.target.value) / 100 })} /></label>
      </div>
      <div className="brick-color-value"><span className="brick-color-preview" aria-label={`Color preview ${preview}`} style={{ background: preview }} /><label>Hex color<input aria-label="Hex color" aria-invalid={!valid} aria-describedby={!valid ? `${titleId}-error` : undefined} spellCheck={false} maxLength={7} value={hex} onChange={(event) => { const next = event.target.value; setHex(next); if (/^#[\da-f]{6}$/i.test(next)) setHsv(hexToHsv(next)) }} /></label></div>
      {!valid && <p id={`${titleId}-error`} role="status">Enter # followed by six letters A–F or digits, such as #38a8e8.</p>}
      <footer><button type="button" onClick={onClose}>Cancel</button><button type="button" disabled={!valid} onClick={() => { onApply(hex.toLowerCase()); onClose() }}>Apply color</button></footer>
    </div>
  </div>, document.body)
}
