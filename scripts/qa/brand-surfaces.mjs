/**
 * Brand surface matrix: screenshots plus layout/accessibility assertions for every guest-reachable
 * surface at six viewports, with 200% zoom and reduced-motion variants. Locators live in
 * scripts/qa/locators.json so a renamed control only needs a label update. See docs/brand/qa/README.md.
 *
 * Environment:
 *   PLAYWRIGHT_MODULE, CHROME_PATH        browser (see scripts/qa/lib/env.mjs)
 *   UI_ORIGIN                              Vite dev origin, localhost only (guest storage is seeded and replaced)
 *   UI_OUTPUT                              artifact directory (default /tmp/brick-brand-surfaces)
 *   SURFACES=landing,build                 run a subset of surface ids
 *   VIEWPORTS=1366x768,390x844             run a subset of viewports
 *   VARIANTS=default,zoom200,reduced-motion run a subset of variants
 *   SCREENSHOT_FORMAT=png|jpeg             default png
 *   STRICT_TOUCH_TARGETS=1                 fail when a touch-viewport control is under 44 CSS px
 *   STRICT_FOCUS=1                         fail when the topmost open dialog does not contain focus
 *   INCLUDE_PENDING=1                      also run surfaces marked `pending` (none at the moment)
 *
 * Hard checks (fail the run): the surface's expected element is visible, no `pageerror`, no horizontal page
 * overflow, no visible control outside the viewport (vertical position is ignored inside scrollable regions
 * and on scrollable pages), every open modal dialog fits the viewport, Escape closes dialogs that declare it,
 * and the seeded guest document is unchanged where the surface declares `documentUnchanged`.
 * Soft checks (recorded): touch targets under 44 px, focus inside the dialog, running animations under
 * reduced motion, console errors.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { hostSnapshot, launchOptions, loadChromium, localOrigin, outputDir } from './lib/env.mjs'
import { CORRUPT_FIXTURE_PATH, FIXTURE_DOCUMENT_PATH, ONBOARDING_KEY, PROJECT_KEY, loadLocators, makeLocate, runSteps as runSharedSteps } from './lib/ui.mjs'

const chromium = await loadChromium()
const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5198', 'the harness seeds and replaces guest browser storage.')
const output = await outputDir('UI_OUTPUT', '/tmp/brick-brand-surfaces')
const format = process.env.SCREENSHOT_FORMAT === 'jpeg' ? 'jpeg' : 'png'
const strictTouch = process.env.STRICT_TOUCH_TARGETS === '1'
const strictFocus = process.env.STRICT_FOCUS === '1'
const locate = makeLocate(await loadLocators())
const fixtureDocument = await readFile(FIXTURE_DOCUMENT_PATH, 'utf8')
const corruptFixture = CORRUPT_FIXTURE_PATH
const publishedHash = '#' + Buffer.from(JSON.stringify({ title: 'QA baseline world', document: JSON.parse(fixtureDocument) })).toString('base64url')

const VIEWPORTS = [
  { id: '1366x768', width: 1366, height: 768, touch: false },
  { id: '1024x768', width: 1024, height: 768, touch: false },
  { id: '768x1024', width: 768, height: 1024, touch: false },
  { id: '390x844', width: 390, height: 844, touch: true },
  { id: '320x740', width: 320, height: 740, touch: true },
  { id: '844x390', width: 844, height: 390, touch: true },
]
const VARIANTS = {
  default: { viewports: VIEWPORTS.map((v) => v.id) },
  // Chrome's 200% zoom halves the CSS viewport and doubles the device pixel ratio.
  zoom200: { viewports: ['1366x768', '1024x768', '768x1024'], zoom: 2 },
  'reduced-motion': { viewports: ['1366x768', '390x844'], reducedMotion: 'reduce' },
}

/**
 * Surfaces. `route` is opened first; `ready` (or any of `readyAny`) must be visible before `steps` run; `expect` (or `expectAny`)
 * must be visible afterwards; `expectPressed` names a toggle that must carry `aria-pressed="true"` or a radio with `aria-checked="true"`
 * (entry-intent modes). `seed: 'fixture'` stores a 250-brick guest build before load; `quickStart`
 * keeps the onboarding guide. `scrollable` marks a document that scrolls (landing) so below-the-fold
 * controls are not "outside". `escape` presses Escape after the screenshot and expects `expect` to hide.
 */
const SURFACES = [
  { id: 'landing', board: '01/02', route: '/', scrollable: true, expect: 'startBuilding' },
  { id: 'landing-continue', board: '01', route: '/', scrollable: true, seed: 'fixture', expect: 'continueBuilding' },
  { id: 'entry-worlds', board: '03/05', route: '/build?classroom=worlds', ready: 'classroomDialog', expect: 'classroomDialog', escape: true },
  { id: 'entry-save', board: '04', route: '/build?classroom=save', ready: 'classroomDialog', expect: 'classroomDialog', escape: true },
  // Wave 0 entry intents: the mode is proven by the pressed nav button plus its mode-only field, not by visibility alone.
  { id: 'entry-join', board: '03', route: '/build?classroom=join', ready: 'classroomDialog', expect: 'classroomDialog', expectPressed: 'classroomJoin', expectAlso: ['enrollmentCode'], escape: true },
  { id: 'entry-signin', board: '03', route: '/build?classroom=signin', ready: 'classroomDialog', expect: 'classroomDialog', expectPressed: 'classroomStudentSignIn', expectAlso: ['signInCode'], escape: true },
  // Teacher mode leads with Google; the email/password form sits behind "Use email and password".
  { id: 'entry-teacher', board: '03', route: '/build?classroom=teacher', ready: 'classroomDialog', expect: 'classroomDialog', expectPressed: 'classroomTeacherSignIn', expectAlso: ['teacherGoogle', 'useEmailPassword'], escape: true },
  { id: 'entry-teacher-email', board: '03', route: '/build?classroom=teacher', ready: 'classroomDialog', steps: [{ click: 'useEmailPassword' }], expect: 'classroomDialog', expectPressed: 'classroomTeacherSignIn', expectAlso: ['teacherEmail'], escape: true },
  { id: 'quick-start', board: '06/16', route: '/build', quickStart: true, ready: 'worldMenu', expect: 'quickStart' },
  { id: 'build', board: '06', route: '/build', seed: 'fixture', ready: 'worldMenu', expect: 'exploreMode', expectAlso: ['saveStatus'], settle: 1500 },
  { id: 'build-drawer', board: '06/16', route: '/build', ready: 'worldMenu', steps: [{ clickIfVisible: 'openBrickDrawer' }], expectAny: ['brickDrawer', 'brickDrawerSheet'] },
  { id: 'world-menu', board: '12', route: '/build', ready: 'worldMenu', steps: [{ click: 'worldMenu' }, { waitFor: 'menuSettings' }], expect: 'studioMenu', escape: true, focusReturnsTo: 'worldMenu' },
  { id: 'settings', board: '12', route: '/build', ready: 'worldMenu', steps: [{ click: 'worldMenu' }, { click: 'menuSettings' }], expect: 'settingsDialog', escape: true, focusReturnsTo: 'worldMenu' },
  { id: 'scene-sheet', board: '08', route: '/build', ready: 'worldMenu', steps: [{ click: 'scene' }, { waitFor: 'sceneDialog' }], expect: 'sceneDialog', selectedTab: 'Scene', escape: true, settle: 800 },
  { id: 'character-sheet', board: '09', route: '/build', ready: 'worldMenu', steps: [{ click: 'character' }, { waitFor: 'sceneDialog' }, { waitCanvasIn: 'sceneDialog' }], expect: 'sceneDialog', selectedTab: 'Character', escape: true, settle: 1500 },
  { id: 'create-brick', board: '10', route: '/build', ready: 'worldMenu', steps: [{ clickIfVisible: 'openBrickDrawer' }, { click: 'createBrick' }], expect: 'createBrickDialog', escape: true, settle: 800 },
  { id: 'color-picker', board: '10', route: '/build', ready: 'worldMenu', steps: [{ clickIfVisible: 'openBrickDrawer' }, { clickIfVisible: 'showBrickProperties' }, { click: 'anyColor' }], expect: 'colorDialog', escape: true },
  { id: 'explore', board: '07', route: '/build', seed: 'fixture', ready: 'worldMenu', steps: [{ click: 'exploreMode' }, { waitFor: 'backToBuilding' }, { waitFor: 'respawn' }], expect: 'backToBuilding', settle: 3500 },
  { id: 'live-create', board: '11', route: '/live/new', ready: 'builderName', expect: 'createRoom' },
  // With a reachable worker an unknown id answers 401 and the page shows the classroom sign-in panel; without one it shows "Cannot reach this room".
  { id: 'live-unavailable', board: '15', route: '/live/0123456789abcdef0123456789abcdef', readyAny: ['liveBlockedHeading', 'classroomDialog'], expectAny: ['liveBlockedHeading', 'classroomDialog'] },
  { id: 'published-viewer', board: '15', route: '/world' + publishedHash, ready: 'publishedTitle', expect: 'remix', settle: 1500 },
  { id: 'published-remix-confirm', board: '15', route: '/world' + publishedHash, seed: 'fixture', ready: 'remix', steps: [{ click: 'remix' }], expect: 'remixConfirm', escape: true, documentUnchanged: true },
  { id: 'graphics-paused', board: '15', route: '/build', seed: 'fixture', ready: 'exploreMode', steps: [{ wait: 1500 }, { loseContext: true }], expect: 'graphicsPaused', expectAlso: ['downloadBuild'] },
  { id: 'import-corrupt', board: '15', route: '/build', seed: 'fixture', ready: 'worldMenu', steps: [{ setInputFiles: { locator: 'importFile', file: corruptFixture } }, { waitFor: 'studioMessage' }], expect: 'studioMessage', documentUnchanged: true },
  { id: 'not-found', board: '15', route: '/nowhere', ready: 'notFoundHeading', expect: 'notFoundHeading' },
]

const only = (name, all) => (process.env[name] ? process.env[name].split(',').map((s) => s.trim()).filter(Boolean) : all)
const surfaceIds = only('SURFACES', SURFACES.map((s) => s.id))
const viewportIds = only('VIEWPORTS', VIEWPORTS.map((v) => v.id))
const variantIds = only('VARIANTS', Object.keys(VARIANTS))

const runSteps = (page, steps, notes) => runSharedSteps(page, locate, steps, notes)

const measure = ({ touch, scrollablePage }) => {
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
  const selector = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=radio], [role=menuitem], [role=checkbox], [role=slider], [role=link]'
  const controls = [...document.querySelectorAll(selector)].filter((el) => isVisible(el) && !el.closest('[aria-hidden="true"], [inert]'))
  const pageScrollable = pageScrollsY || (scrollablePage && docEl.scrollHeight > vh + 1)
  const outside = [], small = []
  for (const el of controls) {
    const r = el.getBoundingClientRect()
    const horizontally = (r.left < -1 || r.right > vw + 1) && !inScrollable(el, 'x')
    const vertically = (r.top < -1 || r.bottom > vh + 1) && !pageScrollable && !inScrollable(el, 'y')
    const rect = [round(r.left), round(r.top), round(r.width), round(r.height)]
    if (horizontally || vertically) outside.push({ name: describe(el), rect })
    if (touch && el.tagName !== 'A' && (r.width < 44 || r.height < 44)) small.push({ name: describe(el), rect })
  }
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
    overflowX, controlCount: controls.length, outside, small, dialogs,
    reducedMotionMatches: matchMedia('(prefers-reduced-motion: reduce)').matches,
    runningAnimations: typeof document.getAnimations === 'function' ? document.getAnimations().filter((a) => a.playState === 'running').length : null,
    activeElement: active && active !== document.body ? `${active.tagName.toLowerCase()} ${describe(active)}` : null,
  }
}

async function runSurface(browser, surface, viewport, variantId) {
  const variant = VARIANTS[variantId]
  const zoom = variant.zoom ?? 1
  const contextOptions = {
    viewport: { width: Math.round(viewport.width / zoom), height: Math.round(viewport.height / zoom) },
    deviceScaleFactor: zoom,
    hasTouch: viewport.touch,
    ...(variant.reducedMotion ? { reducedMotion: variant.reducedMotion } : {}),
  }
  const context = await browser.newContext(contextOptions)
  await context.addInitScript(({ onboardingKey, projectKey, quickStart, seed }) => {
    try {
      if (!quickStart) localStorage.setItem(onboardingKey, 'dismissed')
      if (seed) localStorage.setItem(projectKey, seed)
    } catch { /* blocked storage is its own scenario */ }
  }, { onboardingKey: ONBOARDING_KEY, projectKey: PROJECT_KEY, quickStart: !!surface.quickStart, seed: surface.seed === 'fixture' ? fixtureDocument : null })
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

const browser = await chromium.launch(launchOptions())
const report = { checkedAt: new Date().toISOString(), origin, host: hostSnapshot(), strictTouch, strictFocus, runs: [], skipped: [] }
try {
  for (const variantId of variantIds) {
    for (const viewportId of VARIANTS[variantId].viewports.filter((id) => viewportIds.includes(id))) {
      const viewport = VIEWPORTS.find((v) => v.id === viewportId)
      for (const surface of SURFACES.filter((s) => surfaceIds.includes(s.id))) {
        if (surface.pending && process.env.INCLUDE_PENDING !== '1') {
          report.skipped.push({ surface: surface.id, viewport: viewportId, variant: variantId, reason: surface.pending })
          continue
        }
        const run = await runSurface(browser, surface, viewport, variantId)
        report.runs.push(run)
        console.log(`${run.status.padEnd(6)} ${variantId.padEnd(14)} ${viewportId.padEnd(9)} ${surface.id.padEnd(24)} ${run.durationMs}ms${run.failures.length ? '  ' + run.failures.join(' | ') : ''}${run.notes.length ? '  [' + run.notes.join(' | ') + ']' : ''}`)
        await writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2))
      }
    }
  }
} finally {
  await browser.close()
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
process.exitCode = report.summary.failed ? 1 : 0
