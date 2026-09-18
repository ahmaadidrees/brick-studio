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
import { readFile } from 'node:fs/promises'
import { launchOptions, loadChromium, localOrigin, outputDir } from './lib/env.mjs'
import { CORRUPT_FIXTURE_PATH, FIXTURE_DOCUMENT_PATH, loadLocators, makeLocate } from './lib/ui.mjs'
import { createSurfaceRunner, runMatrix } from './lib/surfaces.mjs'

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

const browser = await chromium.launch(launchOptions())
const runSurface = createSurfaceRunner({ origin, output, locate, format, strictTouch, strictFocus, fixtureDocument })
let report
try {
  report = await runMatrix({ browser, runSurface, surfaces: SURFACES, output, origin, extra: { strictTouch, strictFocus } })
} finally {
  await browser.close()
}
process.exitCode = report.summary.failed ? 1 : 0
