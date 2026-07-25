import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The phone header is positioned by hand-computed offsets across three stacking contexts
 * (header-relative, fixed, and the landscape overrides), so the arithmetic is asserted here:
 * jsdom never evaluates media queries and the layout cannot be screenshotted in CI.
 */
const CONTROL = 44
const GAP = 6
const ROW_GAP = 8
// Read from disk (path is relative to the vitest root): vitest stubs CSS module imports, so a
// `?raw` import would hand back an empty string.
const css = readFileSync('src/brick/brick-studio.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

function mediaBlock(query: string) {
  const start = css.indexOf(`@media ${query} {`)
  if (start < 0) throw new Error(`missing media block: ${query}`)
  let depth = 0
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    else if (css[i] === '}' && (depth -= 1) === 0) return css.slice(css.indexOf('{', start) + 1, i)
  }
  throw new Error(`unterminated media block: ${query}`)
}

function declarations(block: string, selector: string) {
  const rules = [...block.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((rule) => rule[1].split(',').some((part) => part.trim() === selector))
  if (!rules.length) throw new Error(`missing rule: ${selector}`)
  return Object.fromEntries(rules.flatMap((rule) => rule[2].split(';'))
    .map((entry) => entry.split(':'))
    .filter((entry) => entry.length > 1)
    .map(([property, ...value]) => [property.trim(), value.join(':').trim()]))
}

function px(value: string) {
  const match = /(-?\d+(?:\.\d+)?)px\s*\)?\s*$/.exec(value)
  if (!match) throw new Error(`not a trailing px value: ${value}`)
  return Number(match[1])
}

/** Both branches of `max(<floor>, calc(env(safe-area-inset-top) + <inset>))`. */
function topBranches(value: string) {
  const [floor, inset] = [...value.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map((match) => Number(match[1]))
  if (inset === undefined) throw new Error(`not a safe-area top offset: ${value}`)
  return { floor, inset }
}

describe('phone header grid (max-width: 600px)', () => {
  const block = mediaBlock('(max-width: 600px)')
  const header = declarations(block, '.brick-header')
  const actions = declarations(block, '.brick-header-actions')
  const pill = declarations(block, '.view-controls')
  const select = declarations(block, '.selection-mode-control')

  it('stacks two 44px rows inside the header box', () => {
    expect(declarations(block, '.brick-brand-mark').width).toBe(`${CONTROL}px`)
    expect(declarations(block, '.brick-mode-switch').height).toBe(`${CONTROL}px`)
    expect(px(actions.top)).toBe(CONTROL + ROW_GAP)
    expect(px(header.height)).toBe(CONTROL + ROW_GAP + CONTROL)
  })

  it('puts every row-two control on the same line at 44px tall', () => {
    expect(pill.height).toBe(`${CONTROL}px`)
    expect(select.height).toBe(`${CONTROL}px`)
    expect(pill.top).toBe(select.top)
    // Fixed siblings anchor to the header's own top offset, so both must add the same 52px.
    expect(pill.top).toBe(`calc(max(7px, env(safe-area-inset-top)) + ${CONTROL + ROW_GAP}px)`)
    expect(actions.gap).toBe(`${GAP}px`)
  })

  it('lands Select one gap past the two-button view pill', () => {
    const pillWidth = px(pill.width)
    // Home + Top only: 1px border + two flex-stretched buttons + 1px border, so each button
    // clears the 44px target at 45px.
    expect(pillWidth).toBe(2 + 2 * (CONTROL + 1))
    expect(block).toContain('.view-controls button:not(.view-home):nth-last-child(-n+3) { display: none; }')
    expect(pill.left).toBe('max(8px, env(safe-area-inset-left))')
    expect(select.left).toBe(`calc(max(8px, env(safe-area-inset-left)) + ${pillWidth + GAP}px)`)
    expect(select.width).toBe(`${CONTROL}px`)
    // The actions cluster starts past the whole left group so the two can never collide.
    expect(px(actions.left)).toBe(pillWidth + GAP + CONTROL + GAP)
  })

  it('keeps the floating overlays clear of the new row', () => {
    const headerTop = Number(/(\d+)px/.exec(header.top)?.[1])
    const headerHeight = px(header.height)
    for (const selector of ['.brick-toast', '.onboarding-guide']) {
      const { floor, inset } = topBranches(declarations(block, selector).top)
      expect(floor).toBeGreaterThan(headerTop + headerHeight)
      expect(inset).toBeGreaterThan(headerHeight)
    }
    expect(declarations(block, '.empty-guide').display).toBe('none')
  })
})

describe('tablet and landscape control rows', () => {
  it('aligns the view pill with Select at 601-900px', () => {
    const block = mediaBlock('(max-width: 900px)')
    const pill = declarations(block, '.view-controls')
    const select = declarations(block, '.selection-mode-control')
    expect(pill.height).toBe(`${CONTROL}px`)
    expect(pill.padding).toBe('0')
    expect(pill.bottom).toBe(select.bottom)
    // Five 44px buttons plus the pill's own 1px borders.
    expect(px(select.left)).toBe(px(pill.left) + 5 * CONTROL + 2 + GAP)
  })

  it('keeps three view buttons and the same gap in short landscape', () => {
    const block = mediaBlock('(max-height: 520px) and (orientation: landscape)')
    const pill = declarations(block, '.view-controls')
    const select = declarations(block, '.selection-mode-control')
    expect(pill.height).toBe(`${CONTROL}px`)
    expect(pill.width).toBe('auto')
    // Re-shows Front when the 600px rule has hidden it, so the width below is always true.
    expect(block).toContain('.view-controls button:not(.view-home):nth-last-child(3) { display: block; }')
    expect(px(select.left)).toBe(px(pill.left) + 3 * CONTROL + 2 + GAP)
  })
})
