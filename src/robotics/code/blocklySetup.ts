import * as Blockly from 'blockly/core'
import * as En from 'blockly/msg/en'
import { BLOCK_CATEGORY, CATEGORY_COLOURS, ROBO_BLOCK_DEFINITIONS, createBlockDefinitions, type DeviceMenuKind, type DeviceMenuOption, type DeviceOptionsProvider, type RoboCategory } from '../program/catalog/blocks'

/**
 * The one place Blockly is configured for the Robot Workshop (only the lazily loaded Code
 * view imports this, so the studio never pays for Blockly): the English messages, the
 * `robo_*` block definitions over a live device provider, the Brickgineers theme, the
 * category rail and the inject options. No generators: the compiler reads workspace JSON,
 * so `blockly/javascript` (and `eval`) never enter the bundle.
 */

let ready = false

/**
 * Blockly asks a device dropdown for its options every time it builds or opens one. The
 * definitions are registered once, over this trampoline; the mounted workspace points it
 * at its creation and saved program (`setDeviceOptionsProvider`), so a rename, a port
 * change or a program switch shows up without re-registering anything.
 */
let activeProvider: DeviceOptionsProvider | null = null
const trampoline: DeviceOptionsProvider = (kind: DeviceMenuKind, current: string | null): DeviceMenuOption[] => (activeProvider ? activeProvider(kind, current) : [])

/** Points the device dropdowns at a provider; returns a release that only clears it while it is still this one. */
export function setDeviceOptionsProvider(provider: DeviceOptionsProvider): () => void {
  activeProvider = provider
  return () => { if (activeProvider === provider) activeProvider = null }
}

/**
 * Category rows as a rail (the mock's Code board): a coloured dot over the name, no
 * coloured border and no filled row when selected. The colour travels as a CSS variable.
 */
class RailCategory extends Blockly.ToolboxCategory {
  protected override addColourBorder_(colour: string) {
    this.rowDiv_?.style.setProperty('--robo-category', colour || '#9aa7b3')
  }

  protected override createIconDom_(): Element {
    const dot = document.createElement('span')
    dot.className = 'robo-rail-dot'
    dot.setAttribute('aria-hidden', 'true')
    return dot
  }

  override setSelected(isSelected: boolean) {
    super.setSelected(isSelected)
    if (this.rowDiv_) this.rowDiv_.style.backgroundColor = ''
  }
}

/** Idempotent: messages, the category class and the block definitions. */
export function ensureBlocklyReady() {
  if (ready) return
  ready = true
  Blockly.setLocale(En as unknown as Record<string, string>)
  Blockly.registry.register(Blockly.registry.Type.TOOLBOX_ITEM, Blockly.ToolboxCategory.registrationName, RailCategory, true)
  for (const definition of ROBO_BLOCK_DEFINITIONS) delete Blockly.Blocks[definition.type]
  Blockly.defineBlocksWithJsonArray(createBlockDefinitions(trampoline) as unknown as Parameters<typeof Blockly.defineBlocksWithJsonArray>[0])
  installInkTextStyle()
}

export const THEME_NAME = 'robo-brickgineers'
let theme: Blockly.Theme | null = null

/** Zelos (rounded, Scratch-like) in the Brickgineers palette and Nunito; hats get a cap (`startHats`). */
export function roboTheme(): Blockly.Theme {
  if (theme) return theme
  theme = Blockly.Theme.defineTheme(THEME_NAME, {
    name: THEME_NAME,
    base: Blockly.Themes.Zelos,
    startHats: true,
    fontStyle: { family: "Nunito, ui-rounded, system-ui, -apple-system, 'Segoe UI', sans-serif", weight: '800', size: 12 },
    componentStyles: {
      workspaceBackgroundColour: '#F8F4EB',
      toolboxBackgroundColour: '#FFFFFF',
      toolboxForegroundColour: '#263C51',
      flyoutBackgroundColour: '#FBF8F2',
      flyoutForegroundColour: '#263C51',
      flyoutOpacity: 1,
      scrollbarColour: '#CFC5B3',
      scrollbarOpacity: 0.8,
      insertionMarkerColour: '#263C51',
      insertionMarkerOpacity: 0.22,
      cursorColour: '#3565BF',
      selectedGlowColour: '#F4CA3A',
      selectedGlowOpacity: 0.7,
    },
  })
  return theme
}

/** Blockly asks for this folder only for its cursors and menu sprites; `code.css` replaces all of them, so nothing is fetched. */
export const BLOCKLY_MEDIA = '/blockly-media/'

export const WIDE_START_SCALE = 0.82
export const NARROW_START_SCALE = 0.78
/** Scripts areas narrower than this start zoomed out so a starter script fits at 1024×768. */
export const NARROW_WORKSPACE_PX = 680

export function startScaleFor(width: number): number {
  return width > 0 && width < NARROW_WORKSPACE_PX ? NARROW_START_SCALE : WIDE_START_SCALE
}

export function workspaceOptions(toolbox: unknown, startScale: number): Blockly.BlocklyOptions {
  return {
    toolbox: toolbox as Blockly.utils.toolbox.ToolboxDefinition,
    theme: roboTheme(),
    renderer: 'zelos',
    media: BLOCKLY_MEDIA,
    sounds: false,
    trashcan: false,
    comments: false,
    disable: false,
    collapse: false,
    grid: { spacing: 22, length: 1, colour: '#DCD3C2', snap: false },
    zoom: { controls: false, wheel: false, startScale, maxScale: 1.6, minScale: 0.45, scaleSpeed: 1.15, pinch: true },
    move: { scrollbars: { horizontal: true, vertical: true }, drag: true, wheel: true },
    toolboxPosition: 'start',
    horizontalLayout: false,
  }
}

/** WCAG relative luminance of `#rrggbb`. */
export function relativeLuminance(hex: string): number {
  const channel = (index: number) => {
    const value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
}

/**
 * White text on the amber (Events, Control) and coral (Light) blocks is under 3:1, so
 * those categories get ink text. Everything else keeps white, as in the mock.
 */
export const INK_TEXT_CATEGORIES: readonly RoboCategory[] = (Object.keys(CATEGORY_COLOURS) as RoboCategory[]).filter((category) => relativeLuminance(CATEGORY_COLOURS[category]) > 0.3)
export const INK_TEXT_BLOCK_TYPES: readonly string[] = Object.entries(BLOCK_CATEGORY).filter(([, category]) => INK_TEXT_CATEGORIES.includes(category)).map(([type]) => type)

function installInkTextStyle() {
  if (typeof document === 'undefined' || document.getElementById('robo-ink-text')) return
  // Blockly puts the block type on each block's root group as a class.
  const roots = INK_TEXT_BLOCK_TYPES.map((type) => `.robo-code-blockly .${type}`)
  const style = document.createElement('style')
  style.id = 'robo-ink-text'
  // Labels and the block's own dropdowns (zelos draws dropdown text white with !important).
  style.textContent = `${roots.map((root) => `${root} > g > .blocklyText`).join(',\n')} { fill: #263C51 !important; }\n`
    + `${roots.map((root) => `${root} > .blocklyDropdownField > image`).join(',\n')} { filter: brightness(0.25); }\n`
  document.head.appendChild(style)
}
