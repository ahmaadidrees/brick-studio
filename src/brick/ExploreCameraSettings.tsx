import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Settings, X } from 'lucide-react'
import { useBrickStore } from './store'
import type { ExploreCameraMode, ExploreKeyboardMode } from './explorePreferences'
import './explore-camera-settings.css'

export const MOTION_PREFERENCE_KEY = 'brick-studio-motion-preference-v1'
type MotionPreference = 'system' | 'reduced' | 'full'
function readMotionPreference(): MotionPreference {
  try { const value = localStorage.getItem(MOTION_PREFERENCE_KEY); return value === 'reduced' || value === 'full' ? value : 'system' } catch { return 'system' }
}

export function StudioSettings() {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  return <>
    <button ref={trigger} type="button" className="studio-icon-button studio-settings-trigger" aria-label="Settings" title="Settings" aria-haspopup="dialog" onClick={() => setOpen(true)}><Settings size={18} /><span>Settings</span></button>
    {open && <SettingsPanel onClose={() => { setOpen(false); trigger.current?.focus() }} />}
  </>
}

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const camera = useBrickStore((state) => state.exploreCameraMode)
  const keyboard = useBrickStore((state) => state.exploreKeyboardMode)
  const [motion, setMotion] = useState(readMotionPreference)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const close = useCallback(() => closeRef.current(), [])
  useEffect(() => {
    const restoreTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.focus()
    const keyboardHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
      if (event.key !== 'Tab') return
      const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button, select, input, [tabindex="0"]') ?? []).filter((element) => !element.hasAttribute('disabled'))
      const first = controls[0]; const last = controls.at(-1)
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first?.focus() }
    }
    window.addEventListener('keydown', keyboardHandler, true)
    return () => { window.removeEventListener('keydown', keyboardHandler, true); restoreTo?.focus() }
  }, [close])
  const changeMotion = (value: MotionPreference) => {
    setMotion(value)
    try { localStorage.setItem(MOTION_PREFERENCE_KEY, value) } catch { /* Keep controls available if storage is blocked. */ }
    useBrickStore.getState().setReducedMotion(value === 'reduced' || (value === 'system' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches))
    window.dispatchEvent(new Event('brick-studio-motion-preference-change'))
  }
  return createPortal(<div className="studio-settings-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) close() }}>
    <div ref={panel} className="studio-settings-panel" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header className="studio-settings-heading"><div><h2 id={titleId}>Settings</h2><p>Make the controls feel right for you.</p></div><button type="button" className="studio-settings-close" aria-label="Close settings" onClick={close}><X size={20} /></button></header>
      <div className="studio-settings-content">
        <section aria-labelledby={`${titleId}-explore`}><h3 id={`${titleId}-explore`}>Explore camera</h3><p>These controls apply when you walk around your world.</p>
          <label className="studio-setting-field">Camera behavior<select aria-label="Explore camera behavior" value={camera} onChange={(event) => useBrickStore.getState().setExploreCameraMode(event.target.value as ExploreCameraMode)}><option value="follow">Follow</option><option value="free-look">Free look</option></select></label>
          <p className="studio-setting-help">{camera === 'follow' ? 'Gently follows forward movement. Looking around pauses automatic turning.' : 'Travels with your character while keeping the viewing angle you choose.'}</p>
          <label className="studio-setting-field">Keyboard controls<select aria-label="Explore keyboard controls" value={keyboard} onChange={(event) => useBrickStore.getState().setExploreKeyboardMode(event.target.value as ExploreKeyboardMode)}><option value="standard">Standard — WASD or arrows move</option><option value="arrow-camera">WASD move · arrows orbit</option><option value="wasd-camera">Arrows move · WASD orbit</option></select></label>
          <p className="studio-setting-help">{keyboard === 'standard' ? 'Drag to look around and scroll to zoom. Both sets of keys move your character.' : 'Camera keys turn left and right or look up and down. Dragging and scrolling still work.'}</p>
        </section>
        <section aria-labelledby={`${titleId}-comfort`}><h3 id={`${titleId}-comfort`}>Motion & comfort</h3><label className="studio-setting-field">Animation preference<select aria-label="Animation preference" value={motion} onChange={(event) => changeMotion(event.target.value as MotionPreference)}><option value="system">Use device setting</option><option value="reduced">Reduce motion</option><option value="full">Full animation</option></select></label><p className="studio-setting-help">Reduce character animation and interface motion. You can still build, walk, and control the camera.</p></section>
        <section aria-labelledby={`${titleId}-build`}><h3 id={`${titleId}-build`}>Build controls</h3><dl className="studio-settings-shortcuts"><div><dt>Select / move bricks</dt><dd>Left-click / drag</dd></div><div><dt>Orbit camera</dt><dd>Right-drag</dd></div><div><dt>Pan camera</dt><dd>Shift + right-drag</dd></div><div><dt>Trackpad camera</dt><dd>Space + drag</dd></div><div><dt>Zoom</dt><dd>Scroll or pinch</dd></div></dl><p className="studio-setting-help">Camera movement keeps your selection. On touchscreens, use the selection tool and two fingers to move the camera.</p></section>
      </div>
      <footer className="studio-settings-footer"><p>Saved on this device. Your choices do not affect other builders.</p><button type="button" onClick={close}>Done</button></footer>
    </div>
  </div>, document.body)
}

export const ExploreCameraSettings = StudioSettings
