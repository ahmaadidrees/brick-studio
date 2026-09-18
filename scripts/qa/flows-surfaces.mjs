/**
 * Flows v2 surface matrix: /join (three modes + roster open), /worlds (student mine / class / share sheet, teacher),
 * /class (first run, students, settings, worlds, projector) and the editor (idle, brush loaded, selected) at six
 * viewports plus 200 % zoom and reduced motion, with the shared checks in scripts/qa/lib/surfaces.mjs:
 * no horizontal overflow, no control outside the viewport, dialogs fit, Escape closes sheets, 44 px touch targets
 * (STRICT_TOUCH_TARGETS=1), focus rules (STRICT_FOCUS=1), page-level scrolling on the three pages
 * (`pageScroll`; STRICT_PAGE_SCROLL=1 makes an inner scroll container a failure).
 *
 * Signed-in states come from the QA mock classroom backend (scripts/qa/lib/classroom-mock-server.mjs): the harness
 * resets it and seeds the contract fixture (one class ROOM-11, six students, own / classmates' / teacher worlds,
 * a second teacher with no class for the first run) and stores each account's session in sessionStorage before load.
 *
 * Environment: PLAYWRIGHT_MODULE, CHROME_PATH, UI_ORIGIN (localhost only; default http://127.0.0.1:5277),
 * CLASSROOM_API (default http://127.0.0.1:8798, must be the mock the frontend was started with), UI_OUTPUT
 * (default /tmp/brick-flows-surfaces), SURFACES / VIEWPORTS / VARIANTS subsets, SCREENSHOT_FORMAT=png|jpeg,
 * STRICT_TOUCH_TARGETS, STRICT_FOCUS, STRICT_PAGE_SCROLL, INCLUDE_PENDING.
 */
import { readFile } from 'node:fs/promises'
import { launchOptions, loadChromium, localOrigin, outputDir } from './lib/env.mjs'
import { FIXTURE_DOCUMENT_PATH, loadLocators, makeLocate } from './lib/ui.mjs'
import { createSurfaceRunner, runMatrix } from './lib/surfaces.mjs'

const chromium = await loadChromium()
const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5277', 'the harness seeds sessions and guest storage.')
const classroomApi = (process.env.CLASSROOM_API || 'http://127.0.0.1:8798').replace(/\/+$/, '')
const output = await outputDir('UI_OUTPUT', '/tmp/brick-flows-surfaces')
const format = process.env.SCREENSHOT_FORMAT === 'jpeg' ? 'jpeg' : 'png'
const strictTouch = process.env.STRICT_TOUCH_TARGETS === '1'
const strictFocus = process.env.STRICT_FOCUS === '1'
const strictPageScroll = process.env.STRICT_PAGE_SCROLL === '1'
const locate = makeLocate(await loadLocators())
const fixtureDocument = await readFile(FIXTURE_DOCUMENT_PATH, 'utf8')

// Seed the mock: sessions for the surfaces that need an account.
const health = await fetch(`${classroomApi}/__qa/health`).then((r) => r.ok).catch(() => false)
if (!health) { console.error(`No QA mock classroom backend at ${classroomApi}; start scripts/qa/lib/classroom-mock-server.mjs and point VITE_CLASSROOM_SERVER_URL at it.`); process.exit(2) }
await fetch(`${classroomApi}/__qa/reset`, { method: 'POST' })
const fixture = await (await fetch(`${classroomApi}/__qa/seed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()
const sessions = { student: fixture.students.ava_builds, classmate: fixture.students.ben_k, teacher: fixture.teacher, newTeacher: fixture.newTeacher }
const classCode = fixture.class.code
const draft = { schemaVersion: 2, partLibraryVersion: 1, environmentId: 'toy-room', customParts: [], bricks: Array.from({ length: 34 }, (_, i) => ({ id: `d${i}`, partId: 'brick_2x4', x: 2 * i, y: 0, z: 0, rotation: 0, color: '#5888da' })) }

const SURFACES = [
  // /join — W3
  { id: 'join-new', board: 'join', route: `/join?classCode=${classCode}`, pageScroll: true, ready: 'joinHeading', steps: [{ waitFor: 'joinClassChip' }], expect: 'joinSubmit', expectAlso: ['joinUsername', 'joinRosterName', 'joinPassword', 'joinUsernameRules', 'joinPasswordRules', 'joinGuest'] },
  { id: 'join-signin', board: 'join', route: '/join?mode=signin', pageScroll: true, ready: 'joinHeading', expect: 'signinSubmit', expectAlso: ['signinUsername', 'signinPassword', 'signinHaveCode', 'joinNewHere'] },
  { id: 'join-signin-roster', board: 'join', route: '/join?mode=signin', pageScroll: true, ready: 'joinHeading', steps: [{ click: 'signinHaveCode' }, { fill: { locator: 'joinClassCode', value: classCode } }, { waitFor: 'signinRosterLead' }], expect: 'signinRosterGrid', expectAlso: ['signinPassword', 'signinSubmit'], settle: 800 },
  { id: 'join-teacher', board: 'join', route: '/join?mode=teacher', pageScroll: true, ready: 'joinHeading', expect: 'teacherGoogle', expectAlso: ['useEmailPassword', 'joinGuest'] },
  { id: 'join-teacher-email', board: 'join', route: '/join?mode=teacher', pageScroll: true, ready: 'joinHeading', steps: [{ click: 'useEmailPassword' }], expect: 'teacherEmail', expectAlso: ['teacherPassword', 'signinSubmit'] },
  // /worlds — W4
  { id: 'worlds-student-mine', board: 'worlds', route: '/worlds', session: 'student', storage: { 'brick-studio.current-project.v1': draft }, pageScroll: true, ready: 'worldsMain', steps: [{ waitFor: 'worldsSaved' }], expect: 'worldsSaved', expectAlso: ['worldsDraft', 'worldsSectionsNav', 'worldsShare'], settle: 800 },
  { id: 'worlds-student-class', board: 'worlds', route: '/worlds?view=class', session: 'student', pageScroll: true, ready: 'worldsMain', steps: [{ waitFor: 'worldsSharedByClassmates' }], expect: 'worldsSharedByClassmates', expectAlso: ['worldsTeacherWorlds', 'worldsVisit', 'worldsMakeCopy'], settle: 800 },
  { id: 'worlds-share-sheet', board: 'worlds', route: '/worlds', session: 'student', pageScroll: true, ready: 'worldsMain', steps: [{ waitFor: 'worldsSaved' }, { click: 'worldsShare' }], expect: 'worldsShareSheet', expectAlso: ['worldsShareLook', 'worldsShareBuild', 'worldsShareConfirm'], escape: true, focusReturnsTo: 'worldsShare', settle: 800 },
  { id: 'worlds-teacher', board: 'worlds', route: '/worlds?view=class', session: 'teacher', pageScroll: true, ready: 'worldsMain', steps: [{ waitFor: 'worldsSharedByStudents' }], expect: 'worldsSharedByStudents', expectAlso: ['worldsHide'], settle: 800 },
  // /class — W5
  { id: 'class-first-run', board: 'class', route: '/class', session: 'newTeacher', pageScroll: true, ready: 'classFirstRunHeading', expect: 'classCreate', expectAlso: ['classFirstName'] },
  { id: 'class-first-run-invite', board: 'class', route: '/class', session: 'newTeacher', pageScroll: true, ready: 'classFirstRunHeading', steps: [{ fill: { locator: 'classFirstName', value: 'Room 12 Builders' } }, { click: 'classCreate' }, { waitFor: 'classCodeQr' }], expect: 'classCopyJoinLink', expectAlso: ['classShowOnProjector', 'classPrintQr', 'classStudentsIn'], settle: 800 },
  { id: 'class-students', board: 'class', route: '/class', session: 'teacher', pageScroll: true, ready: 'classHeading', expect: 'classSharedList', expectAlso: ['classCodeQr', 'classCopyJoinLink', 'classHideFromClass', 'classTabStudents'], settle: 800 },
  { id: 'class-settings', board: 'class', route: '/class', session: 'teacher', pageScroll: true, ready: 'classHeading', steps: [{ click: 'classTabSettings' }], expect: 'classSettingsHeading', expectAlso: ['classSharingSwitch'] },
  { id: 'class-worlds', board: 'class', route: '/class', session: 'teacher', pageScroll: true, ready: 'classHeading', steps: [{ click: 'classTabWorlds' }], expect: 'classStartWorldHeading' },
  { id: 'class-projector', board: 'class', route: '/class/projector', session: 'teacher', ready: 'projectorHeading', steps: [{ waitFor: 'projectorQr' }], expect: 'projectorCode', expectAlso: ['projectorClose'], settle: 800 },
  // editor — W6 (guest draft; the account-chip variant is covered by the e2e run)
  { id: 'editor-idle', board: 'editor', route: '/build', seed: 'fixture', ready: 'worldMenu', steps: [{ press: 'Escape' }], expectAny: ['stripIdle', 'commandStrip'], expectAlso: ['cameraCluster', 'historyUndo', 'modeSwitch', 'accountSignIn'], settle: 1500 },
  { id: 'editor-brush', board: 'editor', route: '/build', seed: 'fixture', ready: 'worldMenu', steps: [{ clickIfVisible: 'openBrickDrawer' }, { click: 'partButton1x1' }], expect: 'stripBrush', expectAlso: ['placePositioned', 'stripCancel'], settle: 800 },
  { id: 'editor-selected', board: 'editor', route: '/build', seed: 'fixture', ready: 'worldMenu', steps: [{ press: 'Escape' }, { press: 'BracketRight' }], expect: 'stripSelected', expectAlso: ['stripRotate', 'stripDuplicate', 'stripRecolor', 'stripDelete', 'stripAdjust'], settle: 800 },
  { id: 'editor-selected-color', board: 'editor', route: '/build', seed: 'fixture', ready: 'worldMenu', steps: [{ press: 'Escape' }, { press: 'BracketRight' }, { waitFor: 'stripSelected' }, { click: 'stripRecolor' }], expect: 'stripColorDialog', expectAlso: ['anyColor'], escape: true, focusReturnsTo: 'stripRecolor', settle: 800 },
]

const browser = await chromium.launch(launchOptions())
const runSurface = createSurfaceRunner({ origin, output, locate, format, strictTouch, strictFocus, strictPageScroll, fixtureDocument, sessions })
let report
try {
  report = await runMatrix({ browser, runSurface, surfaces: SURFACES, output, origin, extra: { classroomApi, classCode, strictTouch, strictFocus, strictPageScroll } })
} finally {
  await browser.close()
}
process.exitCode = report.summary.failed ? 1 : 0
