import '@testing-library/jest-dom/vitest'

type StorageKey = 'localStorage' | 'sessionStorage'
type JsdomGlobal = { jsdom?: { window?: Partial<Record<StorageKey, Storage>> } }

/**
 * Node 25+ ships its own `localStorage`/`sessionStorage` globals (`undefined` unless
 * `--localstorage-file` is set, or Node's in-memory Storage), and vitest's jsdom
 * environment leaves an existing global alone. Suites that touch storage would then
 * only pass on the Node 22 CI runtime. Point both globals at jsdom's Storage, which is
 * exactly what they resolve to under Node 22, so results match across Node versions.
 */
function adoptJsdomStorage(key: StorageKey) {
  const storage = (globalThis as JsdomGlobal).jsdom?.window?.[key]
  if (!storage) return
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, key)
  if (descriptor && !descriptor.configurable) return
  // Keep vitest's accessor shape: tests may still assign a stub over the global.
  let override: Storage | undefined
  Object.defineProperty(globalThis, key, {
    configurable: true,
    enumerable: true,
    get: () => override ?? storage,
    set: (value: Storage | undefined) => {
      override = value
    },
  })
}

adoptJsdomStorage('localStorage')
adoptJsdomStorage('sessionStorage')

// The classroom sign-in is shared by every tab (src/classroom/sessionStore.ts). Each test starts signed out, as it did
// when the sign-in lived in one tab's sessionStorage.
import { beforeEach } from 'vitest'
import { SESSION_STORE_KEYS } from '../classroom/sessionStore'
beforeEach(() => {
  try {
    globalThis.localStorage?.removeItem(SESSION_STORE_KEYS.store)
    if (typeof document !== 'undefined') document.cookie = `${SESSION_STORE_KEYS.cookie}=; Path=/; Max-Age=0`
  } catch {
    // Node-only suites have no storage.
  }
})

/**
 * Blockly under jsdom: the real cause of the slow Code editor tests (CodeEditor.sections, CodeEditor.loadFailure; 4-97 s
 * a test, timing out under load). Blockly's `dom.getTextWidth` runs for every field it draws: it asks
 * `getComputedStyle(text)` for the font, then measures the text on a canvas it appends to `document.body` (class
 * `blocklyComputeCanvas`), keeping the canvas's context only when it gets one.
 *
 * - jsdom's `getComputedStyle` walks every stylesheet rule for each element: about 90% of an editor test's time.
 * - jsdom has no canvas: `getContext()` reports "Not implemented" and returns null, so each measurement appended another
 *   canvas, and the text measured 0 wide.
 *
 * So Blockly's text gets its font answered at once (blank: the width is 0 whatever it is; anything else is still
 * jsdom's), and its measuring canvas a context that measures 0, which is what Blockly used before; layouts are exactly as they were, with one canvas
 * and no style walk. Every other element and canvas gets jsdom's own answer.
 */
if (typeof window !== 'undefined' && typeof SVGElement !== 'undefined') {
  const jsdomGetComputedStyle = window.getComputedStyle.bind(window)
  const FONT = new Set(['fontSize', 'fontWeight', 'fontFamily'])
  /** The font answered at once; anything else Blockly asks of the text is jsdom's own answer, worked out if it does. */
  const blocklyTextStyle = (element: Element, pseudo?: string | null): CSSStyleDeclaration => {
    let real: CSSStyleDeclaration | undefined
    return new Proxy({} as CSSStyleDeclaration, {
      get: (_target, key) => {
        if (typeof key === 'string' && FONT.has(key)) return ''
        real ??= jsdomGetComputedStyle(element, pseudo)
        const value = Reflect.get(real, key, real) as unknown
        return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(real) : value
      },
    })
  }
  window.getComputedStyle = ((element: Element, pseudo?: string | null) =>
    element instanceof SVGElement && element.tagName === 'text' && /\bblockly/.test(element.getAttribute('class') ?? '')
      ? blocklyTextStyle(element, pseudo)
      : jsdomGetComputedStyle(element, pseudo)) as typeof window.getComputedStyle
}
if (typeof HTMLCanvasElement !== 'undefined') {
  const jsdomGetContext = HTMLCanvasElement.prototype.getContext
  const measuring = { font: '', measureText: () => ({ width: 0 }) } as unknown as CanvasRenderingContext2D
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
    if (this.className === 'blocklyComputeCanvas' && args[0] === '2d') return measuring
    return (jsdomGetContext as (...a: unknown[]) => unknown).apply(this, args)
  } as HTMLCanvasElement['getContext']
}
