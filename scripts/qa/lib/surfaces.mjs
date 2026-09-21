/**
 * Shared surface-matrix runner for brand-surfaces.mjs (guest editor boards) and flows-surfaces.mjs (account pages).
 * A "surface" is a route plus optional steps and an element that must be visible; every surface runs at six
 * viewports with 200 % zoom and reduced-motion variants and yields a screenshot plus layout/accessibility checks.
 *
 * Hard checks: expected element visible, no `pageerror`, no horizontal page overflow, no visible control outside
 * the viewport (vertical position ignored on scrollable pages and inside scrollable regions), every open modal
 * dialog fits, Escape closes surfaces that declare it, seeded guest document unchanged where declared.
 * Soft checks (notes unless the strict flag is set): touch targets under 44 px (STRICT_TOUCH_TARGETS=1), topmost
 * dialog holds focus and focus returns after Escape (STRICT_FOCUS=1), inner scroll containers on a page that is
 * meant to scroll as a whole (`pageScroll: true`, STRICT_PAGE_SCROLL=1), animations under reduced motion, console errors.
 *
 * Surface fields: `id`, `board`, `route`, `ready` / `readyAny`, `steps`, `expect` / `expectAny`, `expectAlso`,
 * `expectPressed`, `selectedTab`, `settle`, `scrollable`, `pageScroll`, `escape`, `focusReturnsTo`, `seed: 'fixture'`,
 * `quickStart`, `documentUnchanged`, `session` (a key into `sessions`, stored under the classroom session key),
 * `storage` (extra localStorage entries), `pending: '<reason>'`.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { hostSnapshot } from './env.mjs'
import { ONBOARDING_KEY, PROJECT_KEY, runSteps as runSharedSteps } from './ui.mjs'

export const SESSION_KEY = 'brick-studio.classroom-session.v1'

export const VIEWPORTS = [
  { id: '1366x768', width: 1366, height: 768, touch: false },
  { id: '1024x768', width: 1024, height: 768, touch: false },
  { id: '768x1024', width: 768, height: 1024, touch: false },
  { id: '390x844', width: 390, height: 844, touch: true },
  { id: '320x740', width: 320, height: 740, touch: true },
  { id: '844x390', width: 844, height: 390, touch: true },
]
export const VARIANTS = {
  default: { viewports: VIEWPORTS.map((v) => v.id) },
  // Chrome's 200% zoom halves the CSS viewport and doubles the device pixel ratio.
  zoom200: { viewports: ['1366x768', '1024x768', '768x1024'], zoom: 2 },
  'reduced-motion': { viewports: ['1366x768', '390x844'], reducedMotion: 'reduce' },
}

export const only = (name, all) => (process.env[name] ? process.env[name].split(',').map((s) => s.trim()).filter(Boolean) : all)

/** Runs in the page. */
export const measure = ({ touch, scrollablePage }) => {
  const vw = innerWidth, vh = innerHeight
  const round = (n) => Math.round(n)
  const docEl = document.documentElement
  const overflowX = Math.max(docEl.scrollWidth, document.body.scrollWidth) - vw
  const isVisible = (el) => {
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return false
    const r = el.getBoundingClientRect()
    return r.width > 1 && r.height > 1
  }
  // A control is reachable when an ancestor (or the page itself) can scroll it into view on that axis.
  const inScrollable = (el, axis) => {
    let node = el.parentElement
    while (node && node !== document.body) {
      const cs = getComputedStyle(node)
      if (axis === 'y' && /(auto|scroll)/.test(cs.overflowY) && node.scrollHeight > node.clientHeight + 1) return true
      if (axis === 'x' && /(auto|scroll)/.test(cs.overflowX) && node.scrollWidth > node.clientWidth + 1) return true
      node = node.parentElement
    }
    return false
  }
  const clipped = (value) => value === 'hidden' || value === 'clip'
  const pageScrollsY = docEl.scrollHeight > vh + 1 && !clipped(getComputedStyle(docEl).overflowY) && !clipped(getComputedStyle(document.body).overflowY)
  const describe = (el) => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('name') || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 60)
  const selector = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=radio], [role=menuitem], [role=checkbox], [role=slider], [role=link], [role=switch]'
  const controls = [...document.querySelectorAll(selector)].filter((el) => isVisible(el) && !el.closest('[aria-hidden="true"], [inert]'))
  const pageScrollable = pageScrollsY || (scrollablePage && docEl.scrollHeight > vh + 1)
  const outside = [], small = []
  for (const el of controls) {
    const r = el.getBoundingClientRect()
    const horizontally = (r.left < -1 || r.right > vw + 1) && !inScrollable(el, 'x')
    const vertically = (r.top < -1 || r.bottom > vh + 1) && !pageScrollable && !inScrollable(el, 'y')
    const rect = [round(r.left), round(r.top), round(r.width), round(r.height)]
    if (horizontally || vertically) outside.push({ name: describe(el), rect })
    // Radios inside a labelled option (the share sheet) are sized by their label; measure the label instead.
    const target = el.type === 'radio' && el.closest('label') ? el.closest('label') : el
    const tr = target.getBoundingClientRect()
    if (touch && el.tagName !== 'A' && (tr.width < 44 || tr.height < 44)) small.push({ name: describe(el), rect: [round(tr.left), round(tr.top), round(tr.width), round(tr.height)] })
  }
  // Inner scroll containers (anything but the document, dialogs/sheets and horizontal tab rows) on a page that should scroll as a whole.
  const scrollContainers = [...document.querySelectorAll('body *')].filter((el) => {
    const cs = getComputedStyle(el)
    return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1 && isVisible(el) && !el.closest('[role=dialog], [role=menu], [role=listbox]')
  }).map((el) => ({ selector: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`.slice(0, 80), height: round(el.clientHeight), scrollHeight: round(el.scrollHeight) }))
  // Stacked modals (the color picker above the brick sheet): only the topmost one must hold focus.
  const dialogElements = [...document.querySelectorAll('[role=dialog][aria-modal="true"], dialog[open]')].filter(isVisible)
  const dialogs = dialogElements.map((el, index) => {
    const r = el.getBoundingClientRect()
    const labelled = document.getElementById(el.getAttribute('aria-labelledby') || '')
    return {
      name: el.getAttribute('aria-label') || labelled?.textContent?.replace(/\s+/g, ' ').trim() || 'dialog',
      fits: r.left >= -1 && r.top >= -1 && r.right <= vw + 1 && r.bottom <= vh + 1,
      rect: [round(r.left), round(r.top), round(r.width), round(r.height)],
      containsFocus: el.contains(document.activeElement),
      topmost: index === dialogElements.length - 1,
    }
  })
  const active = document.activeElement
  return {
    viewport: { width: vw, height: vh, devicePixelRatio, scrollWidth: docEl.scrollWidth, scrollHeight: docEl.scrollHeight, pageScrollsY },
    overflowX, controlCount: controls.length, outside, small, dialogs, scrollContainers,
    reducedMotionMatches: matchMedia('(prefers-reduced-motion: reduce)').matches,
    runningAnimations: typeof document.getAnimations === 'function' ? document.getAnimations().filter((a) => a.playState === 'running').length : null,
    activeElement: active && active !== document.body ? `${active.tagName.toLowerCase()} ${describe(active)}` : null,
  }
}

/**
 * Builds the runner. `sessions` maps a surface's `session` key to a classroom auth result stored in sessionStorage
 * before the first script runs; `fixtureDocument` is the guest document string for `seed: 'fixture'`.
 */
export function createSurfaceRunner({ origin, output, locate, format = 'png', strictTouch = false, strictFocus = false, strictPageScroll = false, fixtureDocument = null, sessions = {} }) {
  const runSteps = (page, steps, notes) => runSharedSteps(page, locate, steps, notes)
  return async function runSurface(browser, surface, viewport, variantId) {
    const variant = VARIANTS[variantId]
    const zoom = variant.zoom ?? 1
    const contextOptions = {
      viewport: { width: Math.round(viewport.width / zoom), height: Math.round(viewport.height / zoom) },
      deviceScaleFactor: zoom,
      hasTouch: viewport.touch,
      ...(variant.reducedMotion ? { reducedMotion: variant.reducedMotion } : {}),
    }
    const context = await browser.newContext(contextOptions)
    if (surface.session && !sessions[surface.session]) throw new Error(`surface ${surface.id} needs session "${surface.session}" but none was provided`)
    // A session entry may be a function: surfaces that change server state (the first run creates a class) get a fresh account per run.
    const session = surface.session ? (typeof sessions[surface.session] === 'function' ? await sessions[surface.session]() : sessions[surface.session]) : null
    await context.addInitScript(({ onboardingKey, projectKey, sessionKey, quickStart, seed, storage, session }) => {
      try {
        if (!quickStart) localStorage.setItem(onboardingKey, 'dismissed')
        if (seed) localStorage.setItem(projectKey, seed)
        for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
        if (session) sessionStorage.setItem(sessionKey, JSON.stringify(session))
      } catch { /* blocked storage is its own scenario */ }
    }, { onboardingKey: ONBOARDING_KEY, projectKey: PROJECT_KEY, sessionKey: SESSION_KEY, quickStart: !!surface.quickStart, seed: surface.seed === 'fixture' ? fixtureDocument : null, storage: surface.storage ?? {}, session })
    const page = await context.newPage()
    const pageErrors = [], consoleErrors = [], failures = [], notes = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 300)) })
    page.on('dialog', (dialog) => dialog.type() === 'confirm' ? dialog.accept() : dialog.dismiss())
    const started = Date.now()
    const suffix = variantId === 'default' ? '' : `-${variantId}`
    const shotDir = path.join(output, surface.id)
    await mkdir(shotDir, { recursive: true })
    const screenshot = path.join(shotDir, `${viewport.id}${suffix}.${format}`)
    let checks = null
    try {
      await page.goto(`${origin}${surface.route}`, { waitUntil: 'domcontentloaded' })
      if (surface.ready) await locate(page, surface.ready).first().waitFor({ state: 'visible', timeout: 20000 })
      if (surface.readyAny) {
        await Promise.any(surface.readyAny.map((key) => locate(page, key).first().waitFor({ state: 'visible', timeout: 20000 })))
          .catch(() => { throw new Error(`none of ${surface.readyAny.join(', ')} became visible`) })
      }
      await runSteps(page, surface.steps, notes)
      if (surface.expect) await locate(page, surface.expect).first().waitFor({ state: 'visible', timeout: 15000 })
      if (surface.expectAny) {
        const visible = await Promise.all(surface.expectAny.map((key) => locate(page, key).first().isVisible().catch(() => false)))
        if (!visible.some(Boolean)) failures.push(`none of ${surface.expectAny.join(', ')} visible`)
      }
      for (const key of surface.expectAlso ?? []) {
        if (!(await locate(page, key).first().isVisible().catch(() => false))) failures.push(`${key} not visible`)
      }
      if (surface.expectPressed) {
        // Toggle buttons carry aria-pressed; the SegmentedControl modes are role=radio with aria-checked.
        const target = locate(page, surface.expectPressed).first()
        const pressed = await target.evaluate((el) => el.getAttribute('aria-pressed') ?? el.getAttribute('aria-checked')).catch(() => null)
        if (pressed !== 'true') failures.push(`${surface.expectPressed} is not pressed/checked (aria-pressed/aria-checked=${JSON.stringify(pressed)})`)
      }
      if (surface.selectedTab) {
        // Scoped to the open sheet: the brick drawer also has a (selected) category tab.
        const selected = await locate(page, surface.expect).first().getByRole('tab', { selected: true }).first().textContent().catch(() => null)
        if (selected?.trim() !== surface.selectedTab) failures.push(`selected tab is ${JSON.stringify(selected)} not ${surface.selectedTab}`)
      }
      await page.waitForTimeout(surface.settle ?? 500)
      checks = await page.evaluate(measure, { touch: viewport.touch, scrollablePage: !!surface.scrollable })
      if (checks.overflowX > 1) failures.push(`horizontal overflow ${checks.overflowX}px`)
      if (checks.outside.length) failures.push(`controls outside viewport: ${checks.outside.map((c) => `${c.name} ${c.rect.join(',')}`).join('; ')}`)
      for (const dialog of checks.dialogs) {
        if (!dialog.fits) failures.push(`dialog "${dialog.name}" exceeds viewport ${dialog.rect.join(',')}`)
        if (!dialog.containsFocus && dialog.topmost) (strictFocus ? failures : notes).push(`dialog "${dialog.name}" does not contain focus (active: ${checks.activeElement})`)
        else if (!dialog.containsFocus) notes.push(`dialog "${dialog.name}" is below another open dialog; focus is in the child dialog`)
      }
      if (checks.small.length) (strictTouch ? failures : notes).push(`${checks.small.length} touch targets under 44px: ${checks.small.slice(0, 8).map((c) => `${c.name} ${c.rect[2]}x${c.rect[3]}`).join('; ')}${checks.small.length > 8 ? ' …' : ''}`)
      if (surface.pageScroll && checks.scrollContainers.length) {
        (strictPageScroll ? failures : notes).push(`inner scroll container(s) instead of page-level scrolling: ${checks.scrollContainers.map((c) => `${c.selector} ${c.height}/${c.scrollHeight}`).join('; ')}`)
      }
      if (variant.reducedMotion) {
        if (!checks.reducedMotionMatches) failures.push('prefers-reduced-motion not applied')
        if (checks.runningAnimations) notes.push(`${checks.runningAnimations} animations running under reduced motion`)
      }
      await page.screenshot({ path: screenshot, fullPage: !!surface.scrollable, ...(format === 'jpeg' ? { type: 'jpeg', quality: 80 } : {}) })
      if (surface.escape) {
        await page.keyboard.press('Escape')
        const target = locate(page, surface.expect).first()
        const hidden = await target.waitFor({ state: 'hidden', timeout: 3000 }).then(() => true).catch(() => false)
        if (!hidden) failures.push('Escape did not close the surface')
        else if (surface.focusReturnsTo) {
          const restored = await locate(page, surface.focusReturnsTo).first().evaluate((el) => el === document.activeElement).catch(() => false)
          if (!restored) (strictFocus ? failures : notes).push(`focus did not return to ${surface.focusReturnsTo}`)
        }
      }
      if (surface.documentUnchanged) {
        const stored = await page.evaluate((key) => localStorage.getItem(key), PROJECT_KEY)
        let same = false
        try { same = JSON.stringify(JSON.parse(stored)) === JSON.stringify(JSON.parse(fixtureDocument)) } catch { same = false }
        if (!same) failures.push('seeded guest document changed')
      }
      if (pageErrors.length) failures.push(`pageerror: ${pageErrors.join(' | ')}`)
    } catch (error) {
      failures.push(String(error).split('\n')[0])
      await page.screenshot({ path: screenshot.replace(/\.(png|jpeg)$/, '-failure.$1') }).catch(() => {})
    } finally {
      await context.close()
    }
    return {
      surface: surface.id, board: surface.board, viewport: viewport.id, variant: variantId,
      status: failures.length ? 'failed' : 'passed', failures, notes, checks, consoleErrors,
      screenshot: path.relative(output, screenshot), durationMs: Date.now() - started,
    }
  }
}

/** Runs the whole matrix, writes `results.json` after every run and returns the report. */
export async function runMatrix({ browser, runSurface, surfaces, output, origin, extra = {} }) {
  const surfaceIds = only('SURFACES', surfaces.map((s) => s.id))
  const viewportIds = only('VIEWPORTS', VIEWPORTS.map((v) => v.id))
  const variantIds = only('VARIANTS', Object.keys(VARIANTS))
  const report = { checkedAt: new Date().toISOString(), origin, commit: process.env.QA_COMMIT || null, host: hostSnapshot(), ...extra, runs: [], skipped: [] }
  for (const variantId of variantIds) {
    for (const viewportId of VARIANTS[variantId].viewports.filter((id) => viewportIds.includes(id))) {
      const viewport = VIEWPORTS.find((v) => v.id === viewportId)
      for (const surface of surfaces.filter((s) => surfaceIds.includes(s.id))) {
        if (surface.pending && process.env.INCLUDE_PENDING !== '1') {
          report.skipped.push({ surface: surface.id, viewport: viewportId, variant: variantId, reason: surface.pending })
          continue
        }
        const run = await runSurface(browser, surface, viewport, variantId)
        report.runs.push(run)
        console.log(`${run.status.padEnd(6)} ${variantId.padEnd(14)} ${viewportId.padEnd(9)} ${surface.id.padEnd(26)} ${run.durationMs}ms${run.failures.length ? '  ' + run.failures.join(' | ') : ''}${run.notes.length ? '  [' + run.notes.join(' | ') + ']' : ''}`)
        await writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2))
      }
    }
  }
  report.summary = {
    runs: report.runs.length,
    passed: report.runs.filter((r) => r.status === 'passed').length,
    failed: report.runs.filter((r) => r.status === 'failed').length,
    skipped: report.skipped.length,
    notes: report.runs.reduce((n, r) => n + r.notes.length, 0),
  }
  await writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ result: report.summary.failed ? 'failed' : 'passed', output, ...report.summary }))
  return report
}
