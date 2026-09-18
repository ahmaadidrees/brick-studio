/**
 * Per-board evidence for the integrated candidate: one screenshot per approved board (01–16) at 1366×768 and
 * 390×844, reached through role/label locators (scripts/qa/locators.json) that use the CONTRACTS.md header and
 * menu names. Writes `NN-<board>[-<state>]-<viewport>.png`, `captures.json` and a `README.md` table into the
 * output directory (default docs/brand/qa/integrated/boards).
 *
 * Environment:
 *   PLAYWRIGHT_MODULE, CHROME_PATH   browser (scripts/qa/lib/env.mjs)
 *   UI_ORIGIN                        Vite dev origin, localhost only (guest storage is replaced)
 *   UI_OUTPUT                        output directory
 *   BOARDS=06,07                     subset by board number
 *   VIEWPORTS=1366x768,390x844       subset of viewports
 *   SESSION_STORAGE_FILE=<json>      sessionStorage entries for a signed-in classroom session
 *                                    (`brick-studio.classroom-session.v1`); boards 05/13/14 are attempted only
 *                                    when this is set and the dev server points at a worker with the classroom secrets
 *   LIVE_ROOM=0                      skip creating a guest room for board 11 (default: attempt it, downgrade to
 *                                    "needs fixture" when the worker is unreachable)
 *
 * A capture that needs an account, a teacher session or a live worker that is not available is recorded as
 * `needs-fixture` with the exact reason instead of failing; every other error fails the run. Each capture also
 * records which CONTRACTS.md header controls were visible (brand home link, world title menu, save status, Scene,
 * Character, People / Build together, Settings, Explore / Back to building) so the header spec can be checked
 * per board without opening the images.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hostSnapshot, launchOptions, loadChromium, localOrigin, outputDir } from './lib/env.mjs'
import { CORRUPT_FIXTURE_PATH, FIXTURE_DOCUMENT_PATH, loadLocators, makeLocate, runSteps, seedContext } from './lib/ui.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const chromium = await loadChromium()
const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5198', 'the script seeds and replaces guest browser storage.')
const output = await outputDir('UI_OUTPUT', path.join(here, '../../docs/brand/qa/integrated/boards'))
const locate = makeLocate(await loadLocators())
const fixtureDocument = await readFile(FIXTURE_DOCUMENT_PATH, 'utf8')
const publishedHash = '#' + Buffer.from(JSON.stringify({ title: 'QA capture world', document: JSON.parse(fixtureDocument) })).toString('base64url')
const session = process.env.SESSION_STORAGE_FILE ? JSON.parse(await readFile(process.env.SESSION_STORAGE_FILE, 'utf8')) : null
const liveRoom = process.env.LIVE_ROOM !== '0'

const VIEWPORTS = [
  { id: '1366x768', width: 1366, height: 768, touch: false },
  { id: '390x844', width: 390, height: 844, touch: true },
]

const NEEDS_CLASSROOM = 'needs fixture: a signed-in classroom account (sessionStorage key brick-studio.classroom-session.v1) and a worker with the classroom secrets; local wrangler dev has no .dev.vars, so no account can be created here. Pass SESSION_STORAGE_FILE with the session entries against a dev server pointed at such a worker.'
const NEEDS_TEACHER = 'needs fixture: a signed-in teacher session (sessionStorage key brick-studio.classroom-session.v1 with a teacher user) and a worker with the classroom secrets; local wrangler dev has no .dev.vars. Pass SESSION_STORAGE_FILE with the session entries against a dev server pointed at such a worker.'

/**
 * `ready`/`readyAny` must be visible before `steps`; `expect`/`expectAny` afterwards.
 * `requires`: 'classroom' | 'teacher' (skipped unless SESSION_STORAGE_FILE is set) or 'live' (attempted; a failure
 * to create the room becomes needs-fixture). `fullPage` captures the whole scrolling document. `viewports` limits a
 * board to some viewports. `header` requests the header-control probe.
 */
const BOARDS = [
  { board: '01', slug: 'landing', state: 'start-building', route: '/', fullPage: true, expect: 'startBuilding' },
  { board: '01', slug: 'landing', state: 'continue-building', route: '/', seed: true, expect: 'continueBuilding' },
  { board: '02', slug: 'how-it-works-teachers', route: '/', ready: 'startBuilding', expect: 'startBuilding', steps: [{ scrollToHeading: ['From your first brick', 'A creative space for your classroom', 'More creating', 'How it works', 'teachers'] }] },
  { board: '03', slug: 'sign-in-enrollment', state: 'join', route: '/build?classroom=join', expect: 'classroomDialog', pressed: 'classroomJoin' },
  { board: '03', slug: 'sign-in-enrollment', state: 'student-sign-in', route: '/build?classroom=signin', expect: 'classroomDialog', pressed: 'classroomStudentSignIn' },
  { board: '03', slug: 'sign-in-enrollment', state: 'teacher-sign-in', route: '/build?classroom=teacher', expect: 'classroomDialog', pressed: 'classroomTeacherSignIn' },
  { board: '04', slug: 'account-recovery', state: 'guest-save-handoff', route: '/build?classroom=save', seed: true, expect: 'classroomDialog' },
  { board: '04', slug: 'account-recovery', state: 'password-reset', route: '/build?classroom=worlds', requires: 'classroom', reason: NEEDS_CLASSROOM + ' The account must carry resetRequired to show "Choose your new password".', expect: 'classroomDialog' },
  { board: '05', slug: 'worlds-class', state: 'my-worlds', route: '/build?classroom=worlds', requires: 'classroom', reason: NEEDS_CLASSROOM, expect: 'classroomDialog' },
  { board: '05', slug: 'worlds-class', state: 'my-class', route: '/build?classroom=class', requires: 'classroom', reason: NEEDS_CLASSROOM, expect: 'classroomDialog' },
  { board: '06', slug: 'build-editor', route: '/build', seed: true, header: true, ready: 'worldMenu', expect: 'exploreMode', settle: 1500 },
  { board: '06', slug: 'build-editor', state: 'brick-drawer', route: '/build', seed: true, header: true, ready: 'worldMenu', steps: [{ clickIfVisible: 'openBrickDrawer' }], expectAny: ['brickDrawer', 'brickDrawerSheet'], settle: 800 },
  { board: '07', slug: 'explore', route: '/build', seed: true, header: true, ready: 'worldMenu', steps: [{ click: 'exploreMode' }, { waitFor: 'backToBuilding' }, { waitFor: 'respawn' }], expect: 'backToBuilding', settle: 3500 },
  { board: '08', slug: 'scenes-plate', route: '/build', ready: 'worldMenu', steps: [{ click: 'scene' }, { waitFor: 'sceneDialog' }], expect: 'sceneDialog', selectedTab: 'Scene', settle: 800 },
  { board: '09', slug: 'character-studio', route: '/build', ready: 'worldMenu', steps: [{ click: 'character' }, { waitFor: 'sceneDialog' }, { waitCanvasIn: 'sceneDialog' }], expect: 'sceneDialog', selectedTab: 'Character', settle: 1500 },
  { board: '10', slug: 'custom-bricks-color', state: 'create-brick', route: '/build', ready: 'worldMenu', steps: [{ clickIfVisible: 'openBrickDrawer' }, { click: 'createBrick' }], expect: 'createBrickDialog', settle: 800 },
  { board: '10', slug: 'custom-bricks-color', state: 'color-picker', route: '/build', ready: 'worldMenu', steps: [{ clickIfVisible: 'openBrickDrawer' }, { clickIfVisible: 'showBrickProperties' }, { click: 'anyColor' }], expect: 'colorDialog' },
  { board: '11', slug: 'guest-collaboration', state: 'create-room', route: '/live/new', ready: 'builderName', expect: 'createRoom' },
  { board: '11', slug: 'guest-collaboration', state: 'in-room-people', route: '/live/new', requires: 'live', header: true, ready: 'builderName',
    steps: [{ fill: { locator: 'builderName', value: 'QA Builder' } }, { fill: { locator: 'roomName', value: 'Board 11 capture' } }, { click: 'createRoom' }, { waitFor: 'people' }, { clickIfVisible: 'dismissQuickStart' }, { click: 'people' }, { waitFor: 'inviteLink' }],
    expect: 'inviteLink', settle: 1500 },
  { board: '12', slug: 'settings-world-menu', state: 'settings', route: '/build', ready: 'worldMenu', steps: [{ click: 'worldMenu' }, { click: 'menuSettings' }], expect: 'settingsDialog' },
  { board: '12', slug: 'settings-world-menu', state: 'world-menu', route: '/build', ready: 'worldMenu', steps: [{ click: 'worldMenu' }, { waitFor: 'menuSettings' }], expect: 'studioMenu' },
  { board: '13', slug: 'teacher-roster', route: '/build?classroom=class', requires: 'teacher', reason: NEEDS_TEACHER, expect: 'classroomDialog' },
  { board: '14', slug: 'teacher-access-groups', route: '/build?classroom=class', requires: 'teacher', reason: NEEDS_TEACHER + ' Class settings is the third "Class sections" tab.', expect: 'classroomDialog' },
  { board: '15', slug: 'safe-states-viewer', state: 'published-viewer', route: '/world' + publishedHash, ready: 'publishedTitle', expect: 'remix', settle: 1500 },
  { board: '15', slug: 'safe-states-viewer', state: 'remix-confirm', route: '/world' + publishedHash, seed: true, ready: 'remix', steps: [{ click: 'remix' }], expect: 'remixConfirm' },
  { board: '15', slug: 'safe-states-viewer', state: 'graphics-paused', route: '/build', seed: true, ready: 'exploreMode', steps: [{ wait: 1500 }, { loseContext: true }], expect: 'graphicsPaused' },
  { board: '15', slug: 'safe-states-viewer', state: 'import-corrupt', route: '/build', seed: true, ready: 'worldMenu', steps: [{ setInputFiles: { locator: 'importFile', file: CORRUPT_FIXTURE_PATH } }, { waitFor: 'studioMessage' }], expect: 'studioMessage' },
  // With a reachable worker an unknown id answers 401 and the page shows the classroom sign-in panel; without one it shows "Cannot reach this room".
  { board: '15', slug: 'safe-states-viewer', state: 'live-unavailable', route: '/live/0123456789abcdef0123456789abcdef', readyAny: ['liveBlockedHeading', 'classroomDialog'], expectAny: ['liveBlockedHeading', 'classroomDialog'] },
  { board: '15', slug: 'safe-states-viewer', state: 'not-found', route: '/nowhere', ready: 'notFoundHeading', expect: 'notFoundHeading' },
  { board: '16', slug: 'mobile', state: 'quick-start', route: '/build', quickStart: true, viewports: ['390x844'], ready: 'worldMenu', expect: 'quickStart' },
  { board: '16', slug: 'mobile', state: 'build', route: '/build', seed: true, header: true, viewports: ['390x844'], ready: 'worldMenu', expect: 'exploreMode', settle: 1500 },
  { board: '16', slug: 'mobile', state: 'brick-sheet', route: '/build', seed: true, viewports: ['390x844'], ready: 'worldMenu', steps: [{ clickIfVisible: 'openBrickDrawer' }], expectAny: ['brickDrawerSheet', 'brickDrawer'], settle: 800 },
]

const HEADER_CONTROLS = ['brandHome', 'worldMenu', 'saveStatus', 'scene', 'character', 'people', 'buildTogether', 'modeSwitch', 'exploreMode', 'accountChip', 'accountSignIn', 'backToBuilding']

const only = (name, all) => (process.env[name] ? process.env[name].split(',').map((s) => s.trim()).filter(Boolean) : all)
const boardIds = only('BOARDS', [...new Set(BOARDS.map((b) => b.board))])
const viewportIds = only('VIEWPORTS', VIEWPORTS.map((v) => v.id))

/** Resolves when any of the locators is visible; rejects after 20 s naming all of them. */
async function waitForAny(page, keys) {
  await Promise.any(keys.map((key) => locate(page, key).first().waitFor({ state: 'visible', timeout: 20000 })))
    .catch(() => { throw new Error(`none of ${keys.join(', ')} became visible`) })
}

const fileName = (entry, viewport) => `${entry.board}-${entry.slug}${entry.state ? '-' + entry.state : ''}-${viewport.id}.png`

async function capture(browser, entry, viewport) {
  const file = fileName(entry, viewport)
  const record = { board: entry.board, slug: entry.slug, state: entry.state ?? null, viewport: viewport.id, route: entry.route.split('#')[0], file, status: 'captured', reason: null, notes: [], header: null }
  if ((entry.requires === 'classroom' || entry.requires === 'teacher') && !session) {
    return { ...record, status: 'needs-fixture', reason: entry.reason, file: null }
  }
  if (entry.requires === 'live' && !liveRoom) {
    return { ...record, status: 'needs-fixture', reason: 'LIVE_ROOM=0: guest room creation skipped', file: null }
  }
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.touch })
  await seedContext(context, { quickStart: !!entry.quickStart, seed: entry.seed ? fixtureDocument : null, session: session ?? {} })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('dialog', (dialog) => dialog.type() === 'confirm' ? dialog.accept() : dialog.dismiss())
  try {
    await page.goto(`${origin}${entry.route}`, { waitUntil: 'domcontentloaded' })
    if (entry.ready) await locate(page, entry.ready).first().waitFor({ state: 'visible', timeout: 20000 })
    if (entry.readyAny) await waitForAny(page, entry.readyAny)
    try {
      await runSteps(page, locate, entry.steps, record.notes)
    } catch (error) {
      if (entry.requires === 'live') {
        await context.close()
        return { ...record, status: 'needs-fixture', file: null, reason: `needs fixture: guest room creation did not complete (${String(error).split('\n')[0]}); the dev server must point at a reachable worker (VITE_LIVE_SERVER_URL, e.g. wrangler dev on 127.0.0.1:8787).` }
      }
      throw error
    }
    if (entry.expect) await locate(page, entry.expect).first().waitFor({ state: 'visible', timeout: 15000 })
    if (entry.expectAny) {
      const visible = await Promise.all(entry.expectAny.map((key) => locate(page, key).first().isVisible().catch(() => false)))
      if (!visible.some(Boolean)) throw new Error(`none of ${entry.expectAny.join(', ')} visible`)
    }
    if (entry.pressed) {
      // Toggle buttons carry aria-pressed; the SegmentedControl modes are role=radio with aria-checked.
      const pressed = await locate(page, entry.pressed).first().evaluate((el) => el.getAttribute('aria-pressed') ?? el.getAttribute('aria-checked')).catch(() => null)
      if (pressed !== 'true') throw new Error(`${entry.pressed} is not pressed/checked (aria-pressed/aria-checked=${JSON.stringify(pressed)})`)
    }
    if (entry.selectedTab) {
      // Scoped to the open sheet: the brick drawer also has a (selected) category tab.
      const selected = await locate(page, entry.expect).first().getByRole('tab', { selected: true }).first().textContent().catch(() => null)
      if (selected?.trim() !== entry.selectedTab) record.notes.push(`selected tab is ${JSON.stringify(selected)} not ${entry.selectedTab}`)
    }
    await page.waitForTimeout(entry.settle ?? 500)
    if (entry.header) {
      record.header = {}
      for (const key of HEADER_CONTROLS) record.header[key] = await locate(page, key).first().isVisible().catch(() => false)
    }
    await page.screenshot({ path: path.join(output, file), fullPage: !!entry.fullPage })
    if (pageErrors.length) record.notes.push(`pageerror: ${pageErrors.join(' | ')}`)
  } catch (error) {
    record.status = 'failed'
    record.reason = String(error).split('\n')[0]
    await page.screenshot({ path: path.join(output, file.replace(/\.png$/, '-failure.png')) }).catch(() => {})
  } finally {
    await context.close()
  }
  return record
}

function readme(report) {
  const rows = report.captures.map((c) => {
    const state = c.state ? ` (${c.state})` : ''
    const evidence = c.file ? `\`${c.file}\`` : '—'
    const header = c.header ? Object.entries(c.header).filter(([, v]) => v).map(([k]) => k).join(', ') : ''
    return `| ${c.board}${state} | ${c.viewport} | ${c.status} | ${evidence} | ${[c.reason, ...c.notes].filter(Boolean).join(' ')}${header ? ` header: ${header}` : ''} |`
  })
  return [
    '# Integrated candidate — per-board captures',
    '',
    `Generated by \`scripts/qa/board-captures.mjs\` on ${report.checkedAt} against ${report.origin}` + (report.commit ? ` at \`${report.commit}\`` : '') + '.',
    `Summary: ${report.summary.captured} captured, ${report.summary.needsFixture} need a fixture, ${report.summary.failed} failed.`,
    '',
    '| Board | Viewport | Status | File | Notes |',
    '|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n')
}

const browser = await chromium.launch(launchOptions())
const report = { checkedAt: new Date().toISOString(), origin, commit: process.env.QA_COMMIT ?? null, host: hostSnapshot(), captures: [] }
await mkdir(output, { recursive: true })
try {
  for (const entry of BOARDS.filter((b) => boardIds.includes(b.board))) {
    for (const viewport of VIEWPORTS.filter((v) => viewportIds.includes(v.id) && (!entry.viewports || entry.viewports.includes(v.id)))) {
      const result = await capture(browser, entry, viewport)
      report.captures.push(result)
      console.log(`${result.status.padEnd(13)} ${entry.board} ${(entry.slug + (entry.state ? '/' + entry.state : '')).padEnd(40)} ${viewport.id.padEnd(9)}${result.reason ? '  ' + result.reason : ''}${result.notes.length ? '  [' + result.notes.join(' | ') + ']' : ''}`)
      await writeFile(path.join(output, 'captures.json'), JSON.stringify(report, null, 2))
    }
  }
} finally {
  await browser.close()
}
report.summary = {
  captures: report.captures.length,
  captured: report.captures.filter((c) => c.status === 'captured').length,
  needsFixture: report.captures.filter((c) => c.status === 'needs-fixture').length,
  failed: report.captures.filter((c) => c.status === 'failed').length,
}
await writeFile(path.join(output, 'captures.json'), JSON.stringify(report, null, 2))
await writeFile(path.join(output, 'README.md'), readme(report))
console.log(JSON.stringify({ result: report.summary.failed ? 'failed' : 'passed', output, ...report.summary }))
process.exitCode = report.summary.failed ? 1 : 0
