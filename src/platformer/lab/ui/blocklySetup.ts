import * as Blockly from 'blockly/core'
import * as En from 'blockly/msg/en'
import { BLOCK_CATEGORY, CATEGORY_COLOURS, LAB_BLOCK_DEFINITIONS, createBlockDefinitions, type LabCategory, type OptionsProvider } from '../program/catalog'

/*
 * Blockly for the code lab, adapted from the robotics branch's src/robotics/code/blocklySetup.ts: the same Zelos
 * theme in the Brickgineers palette, the same category rail (a coloured dot over each name), and block definitions
 * registered once over a trampoline so the two level-dependent dropdowns always ask the lab that is open. No
 * generators: the compiler reads workspace JSON, so `blockly/javascript` (and `eval`) never enter the bundle.
 */

let ready = false
let activeProvider: OptionsProvider | null = null
const trampoline: OptionsProvider = (menu, current) => (activeProvider ? activeProvider(menu, current) : [])

export function setOptionsProvider(provider: OptionsProvider): () => void {
  activeProvider = provider
  return () => {
    if (activeProvider === provider) activeProvider = null
  }
}

class RailCategory extends Blockly.ToolboxCategory {
  protected override addColourBorder_(colour: string) {
    this.rowDiv_?.style.setProperty('--lab-category', colour || '#9aa7b3')
  }

  protected override createIconDom_(): Element {
    const dot = document.createElement('span')
    dot.className = 'lab-rail-dot'
    dot.setAttribute('aria-hidden', 'true')
    return dot
  }

  override setSelected(isSelected: boolean) {
    super.setSelected(isSelected)
    if (this.rowDiv_) this.rowDiv_.style.backgroundColor = ''
  }
}

export function ensureBlocklyReady() {
  if (ready) return
  ready = true
  Blockly.setLocale(En as unknown as Record<string, string>)
  Blockly.registry.register(Blockly.registry.Type.TOOLBOX_ITEM, Blockly.ToolboxCategory.registrationName, RailCategory, true)
  for (const d of LAB_BLOCK_DEFINITIONS) delete Blockly.Blocks[d.type]
  Blockly.defineBlocksWithJsonArray(createBlockDefinitions(trampoline) as unknown as Parameters<typeof Blockly.defineBlocksWithJsonArray>[0])
  installInkText()
}

const THEME_NAME = 'lab-brickgineers'
let theme: Blockly.Theme | null = null

export function labTheme(): Blockly.Theme {
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

export function workspaceOptions(toolbox: unknown): Blockly.BlocklyOptions {
  return {
    toolbox: toolbox as Blockly.utils.toolbox.ToolboxDefinition,
    theme: labTheme(),
    renderer: 'zelos',
    media: '/blockly-media/',
    sounds: false,
    trashcan: false,
    comments: false,
    disable: false,
    collapse: false,
    grid: { spacing: 22, length: 1, colour: '#DCD3C2', snap: false },
    zoom: { controls: false, wheel: false, startScale: 0.72, maxScale: 1.6, minScale: 0.4, scaleSpeed: 1.15, pinch: true },
    move: { scrollbars: { horizontal: true, vertical: true }, drag: true, wheel: true },
    toolboxPosition: 'start',
    horizontalLayout: false,
  }
}

function luminance(hex: string): number {
  const ch = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * ch(0) + 0.7152 * ch(1) + 0.0722 * ch(2)
}

/** White text on the light blocks (amber, orange, coral) is hard to read: those get ink text, as in robotics. */
function installInkText() {
  if (typeof document === 'undefined' || document.getElementById('lab-ink-text')) return
  const light = (Object.keys(CATEGORY_COLOURS) as LabCategory[]).filter((c) => luminance(CATEGORY_COLOURS[c]) > 0.3)
  const types = Object.entries(BLOCK_CATEGORY)
    .filter(([, c]) => light.includes(c))
    .map(([t]) => t)
  const roots = types.map((t) => `.lab-code-blockly .${t}`)
  const style = document.createElement('style')
  style.id = 'lab-ink-text'
  style.textContent =
    `${roots.map((r) => `${r} > g > .blocklyText`).join(',\n')} { fill: #263C51 !important; }\n` +
    `${roots.map((r) => `${r} > .blocklyDropdownField > image`).join(',\n')} { filter: brightness(0.25); }\n`
  document.head.appendChild(style)
}
