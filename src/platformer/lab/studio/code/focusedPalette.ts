import type * as Blockly from 'blockly/core'
import { myBlocksFlyout } from '../../core/editor/toolbox'
import { proccodeWords } from './layers'

/** Keep every definition reachable, including definitions with no call on the canvas. */
export function focusedMyBlocksFlyout(ws: Blockly.WorkspaceSvg, open: (code: string) => void): Array<Record<string, unknown>> {
  return myBlocksFlyout(ws).flatMap((item) => {
    if (item.type !== 'procedures_call') return [item]
    const code = (item.extraState as { proccode: string }).proccode
    const callbackKey = `OPEN_DEFINITION_${encodeURIComponent(code)}`
    ws.registerButtonCallback(callbackKey, () => open(code))
    return [{ kind: 'button', text: `See inside ${proccodeWords(code)}`, callbackKey }, item]
  })
}
