import * as Blockly from 'blockly/core'

/**
 * Custom dark theme for Blockly with Zelos renderer, matching StudioApp design (#1d2029 / #14161c).
 */
export const CODE_DARK_THEME = Blockly.Theme.defineTheme('code_dark_theme', {
  name: 'code_dark_theme',
  base: Blockly.Themes.Zelos,
  componentStyles: {
    workspaceBackgroundColour: '#1d2029',
    toolboxBackgroundColour: '#14161c',
    toolboxForegroundColour: '#eef0f5',
    flyoutBackgroundColour: '#181b22',
    flyoutForegroundColour: '#eef0f5',
    flyoutOpacity: 0.98,
    scrollbarColour: '#363c4d',
    scrollbarOpacity: 0.65,
    insertionMarkerColour: '#ffffff',
    insertionMarkerOpacity: 0.35,
    selectedGlowColour: '#ffe066',
    selectedGlowOpacity: 0.8,
  },
})

/** Code Lab's editor: Scratch's light look inside the light app (docs/qa/code-lab-on-main/UX-AUDIT.md). */
export const CODE_LIGHT_THEME = Blockly.Theme.defineTheme('code_light_theme', {
  name: 'code_light_theme',
  base: Blockly.Themes.Zelos,
  componentStyles: {
    workspaceBackgroundColour: '#ffffff',
    toolboxBackgroundColour: '#fbf9f4',
    toolboxForegroundColour: '#2e3350',
    flyoutBackgroundColour: '#f6f3ec',
    flyoutForegroundColour: '#2e3350',
    flyoutOpacity: 1,
    scrollbarColour: '#c9c2b2',
    scrollbarOpacity: 0.7,
    insertionMarkerColour: '#1f2340',
    insertionMarkerOpacity: 0.25,
    selectedGlowColour: '#ffd43b',
    selectedGlowOpacity: 0.95,
  },
})
