import { useRef, useState } from 'react'
import { Camera, Keyboard, MonitorCog, MousePointer2, Settings } from 'lucide-react'
import { Button, Field, SegmentedControl, Sheet } from '../ui'
import { useBrickStore } from './store'
import type { ExploreCameraMode, ExploreKeyboardMode } from './explorePreferences'
import './explore-camera-settings.css'

export const MOTION_PREFERENCE_KEY = 'brick-studio-motion-preference-v1'
type MotionPreference = 'system' | 'reduced' | 'full'
function readMotionPreference(): MotionPreference {
  try { const value = localStorage.getItem(MOTION_PREFERENCE_KEY); return value === 'reduced' || value === 'full' ? value : 'system' } catch { return 'system' }
}

const CAMERA_OPTIONS = [
  { value: 'follow', label: 'Follow' },
  { value: 'free-look', label: 'Free look' },
] as const satisfies ReadonlyArray<{ value: ExploreCameraMode; label: string }>

const MOTION_OPTIONS = [
  { value: 'system', label: 'Device setting' },
  { value: 'reduced', label: 'Reduced' },
  { value: 'full', label: 'Full' },
] as const satisfies ReadonlyArray<{ value: MotionPreference; label: string }>

/** Every row mirrors a real handler in BrickStudioApp / BrickStudioScene; nothing listed here is aspirational. */
const BUILD_SHORTCUTS: ReadonlyArray<[string, string]> = [
  ['Orbit camera', 'Right-drag or Space + drag'],
  ['Pan camera', 'Shift + right-drag'],
  ['Zoom', 'Scroll or pinch'],
  ['Place the loaded brick', 'Click or Enter'],
  ['Put the brush down / clear selection', 'Esc'],
  ['Select more bricks', 'Shift-click, or drag empty space'],
  ['Rotate · Focus · Frame build', 'R · F · Home'],
  ['Nudge selection', 'Arrow keys, Page Up / Page Down'],
  ['Copy · Paste · Duplicate', '⌘C · ⌘V · ⌘D'],
  ['Undo · Redo', '⌘Z · ⇧⌘Z'],
  ['Delete', 'Delete or Backspace'],
  ['Build · Explore', '1 · 2'],
]

const EXPLORE_SHORTCUTS: ReadonlyArray<[string, string]> = [
  ['Run', 'Hold Shift'],
  ['Jump (twice to flip)', 'Space'],
  ['Look around', 'Drag'],
  ['Back to building', 'Esc'],
]

export function StudioSettings() {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  return <>
    <Button ref={trigger} variant="quiet" className="brick-header-tool studio-settings-trigger" icon={<Settings size={18} />} aria-label="Settings" title="Settings" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>Settings</Button>
    <SettingsSheet open={open} onClose={() => setOpen(false)} />
  </>
}

/**
 * Preferences sheet (board 12). Built on the shared Sheet so focus moves in, Tab cycles,
 * Escape closes only this dialog and focus returns to the trigger; `aria-modal` also pauses
 * the studio's global shortcuts through `exploreKeyboardBlocked`.
 */
export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const camera = useBrickStore((state) => state.exploreCameraMode)
  const keyboard = useBrickStore((state) => state.exploreKeyboardMode)
  const [motion, setMotion] = useState(readMotionPreference)
  const changeMotion = (value: MotionPreference) => {
    setMotion(value)
    try { localStorage.setItem(MOTION_PREFERENCE_KEY, value) } catch { /* Keep controls available if storage is blocked. */ }
    useBrickStore.getState().setReducedMotion(value === 'reduced' || (value === 'system' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches))
    window.dispatchEvent(new Event('brick-studio-motion-preference-change'))
  }
  const keyboardHelp = keyboard === 'standard'
    ? 'Drag to look around and scroll to zoom. Both sets of keys move your character.'
    : keyboard === 'arrow-camera'
      ? 'WASD moves. Arrow keys turn left and right or look up and down. Dragging and scrolling still work.'
      : 'Arrow keys move. WASD turns left and right or looks up and down. Dragging and scrolling still work.'
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Settings"
      description="Make the controls feel right for you."
      closeLabel="Close settings"
      className="studio-settings"
      footer={<>
        <p className="studio-settings-footnote">Saved on this device. Your choices do not affect other builders.</p>
        <Button variant="primary" onClick={onClose}>Done</Button>
      </>}
    >
      <section className="studio-settings-section">
        <h3 className="studio-settings-heading"><Camera size={18} aria-hidden="true" />Explore camera</h3>
        <SegmentedControl<ExploreCameraMode>
          label="Explore camera behavior"
          options={CAMERA_OPTIONS}
          value={camera}
          onChange={(value) => useBrickStore.getState().setExploreCameraMode(value)}
          fullWidth
        />
        <p className="studio-setting-help">{camera === 'follow' ? 'Gently follows forward movement. Looking around pauses automatic turning.' : 'Travels with your character while keeping the viewing angle you choose.'}</p>
      </section>

      <section className="studio-settings-section">
        <h3 className="studio-settings-heading"><Keyboard size={18} aria-hidden="true" />Keyboard controls</h3>
        <Field label="Explore keyboard controls" hint={keyboardHelp}>
          {(control) => (
            <select
              {...control}
              className="ui-input studio-settings-select"
              value={keyboard}
              onChange={(event) => useBrickStore.getState().setExploreKeyboardMode(event.target.value as ExploreKeyboardMode)}
            >
              <option value="standard">Standard — WASD or arrows move</option>
              <option value="arrow-camera">WASD move · arrows orbit</option>
              <option value="wasd-camera">Arrows move · WASD orbit</option>
            </select>
          )}
        </Field>
      </section>

      <section className="studio-settings-section">
        <h3 className="studio-settings-heading"><MonitorCog size={18} aria-hidden="true" />Motion &amp; comfort</h3>
        <SegmentedControl<MotionPreference>
          label="Animation preference"
          options={MOTION_OPTIONS}
          value={motion}
          onChange={changeMotion}
          fullWidth
        />
        <p className="studio-setting-help">
          {motion === 'system'
            ? 'Follows your device’s reduce-motion setting.'
            : motion === 'reduced'
              ? 'Reduces character animation and interface motion. You can still build, walk, and control the camera.'
              : 'Plays every animation, even if your device asks for less motion.'}
        </p>
      </section>

      <section className="studio-settings-section">
        <h3 className="studio-settings-heading"><MousePointer2 size={18} aria-hidden="true" />Build controls</h3>
        <dl className="studio-settings-shortcuts">
          {BUILD_SHORTCUTS.map(([action, keys]) => <div key={action}><dt>{action}</dt><dd>{keys}</dd></div>)}
        </dl>
        <p className="studio-setting-help">Camera movement keeps your selection. On touchscreens, use the selection tool and two fingers to move the camera.</p>
        <h4 className="studio-settings-subheading">While exploring</h4>
        <dl className="studio-settings-shortcuts">
          {EXPLORE_SHORTCUTS.map(([action, keys]) => <div key={action}><dt>{action}</dt><dd>{keys}</dd></div>)}
        </dl>
        <p className="studio-setting-help">Movement keys follow the keyboard layout you chose above.</p>
      </section>
    </Sheet>
  )
}

export const ExploreCameraSettings = StudioSettings
