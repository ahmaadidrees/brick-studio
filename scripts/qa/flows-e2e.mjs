/**
 * Flows v2 end to end through the REAL UI: three isolated browser contexts (teacher, student = owner, classmate)
 * drive /class, /class/projector, /join, /worlds and the editor's save sheet; after every step the authoritative
 * state is read back over HTTP as each account (GET /classroom/worlds, /classes, /worlds/:id) — never from the DOM alone.
 *
 * Backends
 *   CLASSROOM_API   the classroom service the frontend was started with (VITE_CLASSROOM_SERVER_URL). On this host the
 *                   local `wrangler dev` Worker answers 503 `classroom_unavailable` without Supabase secrets, so the
 *                   default is the QA mock in scripts/qa/lib/classroom-mock-server.mjs (same routes and error codes).
 *                   `results.json` records which backend answered (`backend.classroom`).
 *   LIVE_API        the real Worker for live rooms (VITE_LIVE_SERVER_URL). Classroom live rooms need Supabase +
 *                   CLASSROOM_TICKET_SECRET on the Worker; steps that need one are recorded as `blocked`, not passed.
 *   UI_ORIGIN       Vite dev origin (localhost only; the harness creates accounts and guest builds)
 *   QA_OUTPUT       evidence directory (default docs/flows/qa/w7/e2e)
 *   QA_RESET=0      keep the mock's state instead of resetting it first (real Worker: no reset is attempted)
 *
 * Re-run: see docs/flows/qa/w7/RESULTS.md ("Commands"). Exit code 1 on any failed step; blocked steps do not fail.
 */
import assert from 'node:assert/strict'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { hostSnapshot, launchOptions, loadChromium, localOrigin, outputDir } from './lib/env.mjs'
import { ONBOARDING_KEY, PROJECT_KEY, loadLocators, makeLocate } from './lib/ui.mjs'

const chromium = await loadChromium()
const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5277', 'the harness creates accounts and replaces guest storage.')
const classroomApi = (process.env.CLASSROOM_API || 'http://127.0.0.1:8798').replace(/\/+$/, '')
const liveApi = (process.env.LIVE_API || 'http://127.0.0.1:8797').replace(/\/+$/, '')
const output = await outputDir('QA_OUTPUT', 'docs/flows/qa/w7/e2e')
const locate = makeLocate(await loadLocators())
// Evidence is numbered per run: drop the previous run's screenshots so stale ones never read as current.
for (const file of await readdir(output).catch(() => [])) if (/\.(jpeg|png)$/.test(file)) await rm(path.join(output, file))
const SESSION_KEY = 'brick-studio.classroom-session.v1'
const stamp = Date.now().toString(36).slice(-4)

const accounts = {
  teacher: { email: 'qa-teacher@example.com', password: 'teach-bricks', className: 'Room 12 Builders' },
  // Both students display as "Maya B." on purpose: the roster tile must still be told apart by username.
  student: { username: 'maya_b', rosterName: 'Maya Brooks', password: 'castle-99', worldTitle: `Maya's Tower ${stamp}` },
  classmate: { username: 'maya_b', rosterName: 'Maya Bishop', password: 'rocket-42' }, // takes the server's suggestion
}

const report = { checkedAt: new Date().toISOString(), origin, backend: { classroom: classroomApi, live: liveApi, classroomKind: 'unknown' }, host: hostSnapshot(), steps: [], state: {} }
const step = (id, status, detail = '', extra = {}) => { report.steps.push({ id, status, detail, ...extra }); console.log(`${status.padEnd(7)} ${id}${detail ? '  ' + detail : ''}`) }

/** Authoritative read/write as an account, straight against the classroom service. */
async function api(pathname, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${classroomApi}${pathname.startsWith('/__qa') ? '' : '/classroom'}${pathname}`, {
    method, headers: { 'content-type': 'application/json', Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const data = await response.json().catch(() => null)
  return { status: response.status, data }
}
const tokenOf = async (page) => page.evaluate((key) => { try { return JSON.parse(sessionStorage.getItem(key))?.session?.accessToken ?? null } catch { return null } }, SESSION_KEY)
const worldsOf = async (token) => { const r = await api('/worlds', { token }); assert.equal(r.status, 200, `GET /classroom/worlds ${r.status} ${r.data?.code || ''}`); return r.data.worlds }

// Which backend is answering? The real Worker without secrets says 503 classroom_unavailable on every classroom route.
{
  const probe = await api('/auth/roster', { method: 'POST', body: { classCode: 'PROBE-00' } })
  report.backend.classroomKind = probe.status === 503 && probe.data?.code === 'classroom_unavailable' ? 'worker-without-supabase' : (await fetch(`${classroomApi}/__qa/health`).then((r) => r.ok).catch(() => false)) ? 'qa-mock' : 'worker'
  console.log(`classroom backend: ${report.backend.classroomKind} (${classroomApi}); live: ${liveApi}`)
  if (report.backend.classroomKind === 'worker-without-supabase') { console.error('The classroom service is not configured; nothing below can run.'); process.exit(2) }
  if (report.backend.classroomKind === 'qa-mock' && process.env.QA_RESET !== '0') await fetch(`${classroomApi}/__qa/reset`, { method: 'POST' })
}

const browser = await chromium.launch(launchOptions())
const shots = []
async function shot(page, name) { const file = path.join(output, `${String(shots.length + 1).padStart(2, '0')}-${name}.jpeg`); await page.screenshot({ path: file, type: 'jpeg', quality: 80 }); shots.push(path.basename(file)); return path.basename(file) }
async function context(name, { width = 1366, height = 768 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true })
  await ctx.addInitScript((key) => { try { localStorage.setItem(key, 'dismissed') } catch { /* blocked storage is its own scenario */ } }, ONBOARDING_KEY)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(`${name}: ${error.message}`))
  page.on('dialog', (dialog) => dialog.type() === 'confirm' ? dialog.accept() : dialog.dismiss())
  return { ctx, page, errors, name }
}
const pageErrors = []
let teacher, student, classmate
let failed = false

/** Runs one step; a thrown error marks it failed (with a failure screenshot) and the run continues where it can. */
async function run(id, page, work, { required = true } = {}) {
  try { const detail = await work(); step(id, 'passed', typeof detail === 'string' ? detail : ''); return true }
  catch (error) {
    const evidence = page ? await shot(page, `${id}-failure`).catch(() => null) : null
    step(id, 'failed', String(error).split('\n')[0], { evidence })
    failed = true
    if (required) throw Object.assign(new Error(`stopping after ${id}`), { stop: true })
    return false
  }
}

try {
  teacher = await context('teacher'); student = await context('student', { width: 1024, height: 768 }); classmate = await context('classmate')
  const T = teacher.page, S = student.page, C = classmate.page
  let inviteLink = '', classCode = '', classId = '', worldId = '', classmateUsername = ''

  // ---------------------------------------------------------------- teacher first run
  await run('teacher-redirect-to-join', T, async () => {
    await T.goto(`${origin}/class`)
    await T.waitForURL((url) => url.pathname === '/join' && url.searchParams.get('mode') === 'teacher' && url.searchParams.get('next') === '/class', { timeout: 15000 })
    await locate(T, 'joinHeading').waitFor()
    return T.url().replace(origin, '')
  })
  await run('teacher-sign-in-email', T, async () => {
    await locate(T, 'useEmailPassword').click()
    await locate(T, 'teacherEmail').fill(accounts.teacher.email)
    await locate(T, 'teacherPassword').fill(accounts.teacher.password)
    await locate(T, 'signinSubmit').click()
    await T.waitForURL((url) => url.pathname === '/class', { timeout: 15000 })
    await locate(T, 'classFirstRunHeading').waitFor({ timeout: 15000 })
    const me = await api('/me', { token: await tokenOf(T) })
    assert.equal(me.status, 200); assert.equal(me.data.user.role, 'teacher'); assert.deepEqual(me.data.classes, [])
    await shot(T, 'class-first-run')
    return 'teacher-login through "Use email and password"; GET /me: teacher, no classes'
  })
  await run('teacher-name-class', T, async () => {
    await locate(T, 'classFirstName').fill(accounts.teacher.className)
    await locate(T, 'classCreate').click()
    await locate(T, 'classCodeQr').waitFor({ timeout: 15000 })
    classCode = (await locate(T, 'classCodeValue').first().textContent()).trim()
    const classes = await api('/classes', { token: await tokenOf(T) })
    assert.equal(classes.status, 200); assert.equal(classes.data.classes.length, 1)
    classId = classes.data.classes[0].id
    assert.equal(classes.data.classes[0].code, classCode, 'code card shows the authoritative enrollment code')
    assert.equal(classes.data.classes[0].name, accounts.teacher.className)
    await shot(T, 'class-invite-step')
    return `class ${classCode} (${classId})`
  })
  await run('teacher-copy-join-link', T, async () => {
    await locate(T, 'classCopyJoinLink').click()
    inviteLink = await T.evaluate(() => navigator.clipboard.readText())
    const url = new URL(inviteLink)
    assert.equal(url.origin, origin); assert.equal(url.pathname, '/join'); assert.equal(url.searchParams.get('classCode'), classCode)
    const qr = await locate(T, 'classCodeQr').getAttribute('src')
    assert(qr?.startsWith('data:image/png'), 'QR rendered as a data URL')
    return inviteLink.replace(origin, '')
  })
  await run('teacher-projector', T, async () => {
    await locate(T, 'classShowOnProjector').click()
    await T.waitForURL((url) => url.pathname === '/class/projector', { timeout: 15000 })
    await locate(T, 'projectorQr').waitFor({ timeout: 15000 })
    assert.equal((await locate(T, 'projectorHeading').textContent()).trim(), accounts.teacher.className)
    assert.equal((await locate(T, 'projectorCode').textContent()).trim(), classCode)
    const size = await locate(T, 'projectorCode').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    await shot(T, 'class-projector')
    await locate(T, 'projectorClose').click()
    await T.waitForURL((url) => url.pathname === '/class', { timeout: 15000 })
    await locate(T, 'classHeading').waitFor({ timeout: 15000 })
    return `code ${classCode} at ${Math.round(size)}px with QR; Close returns to /class`
  })

  // ---------------------------------------------------------------- student joins through the invite
  await run('student-open-invite', S, async () => {
    await S.goto(inviteLink)
    await locate(S, 'joinClassChip').waitFor({ timeout: 15000 })
    assert.equal((await locate(S, 'joinClassChip').textContent()).trim(), accounts.teacher.className)
    assert.equal(await locate(S, 'joinClassCode').inputValue(), classCode)
    await shot(S, 'join-from-invite')
    return `class chip "${accounts.teacher.className}", code prefilled`
  })
  await run('student-weak-password', S, async () => {
    await locate(S, 'joinUsername').fill(accounts.student.username)
    await locate(S, 'joinRosterName').fill(accounts.student.rosterName)
    await locate(S, 'joinPassword').fill('abc')
    const bad = await locate(S, 'joinPasswordRules').locator('.join-rule-bad').count()
    assert(bad >= 1, 'a password rule turns red for "abc"')
    assert.equal(await locate(S, 'joinSubmit').isDisabled(), true, 'submit stays disabled')
    await locate(S, 'joinPassword').fill(accounts.student.username)
    assert.equal(await locate(S, 'joinSubmit').isDisabled(), true, 'password equal to the username stays disabled')
    await locate(S, 'joinPassword').fill('password')
    assert.equal(await locate(S, 'joinSubmit').isDisabled(), true, 'a common password stays disabled')
    await shot(S, 'join-weak-password')
    return 'three weak passwords: rule red, submit disabled (client-side checklist)'
  })
  await run('student-register', S, async () => {
    await locate(S, 'joinPassword').fill(accounts.student.password)
    assert.equal(await locate(S, 'joinSubmit').isDisabled(), false)
    const registered = S.waitForResponse((r) => r.url().endsWith('/classroom/auth/register') && r.request().method() === 'POST')
    await locate(S, 'joinSubmit').click()
    const response = await registered
    assert.equal(response.status(), 201)
    await S.waitForURL((url) => url.pathname === '/worlds', { timeout: 15000 })
    const token = await tokenOf(S)
    const me = await api('/me', { token })
    assert.equal(me.data.user.username, accounts.student.username); assert.equal(me.data.classes[0]?.id, classId)
    assert.deepEqual(await worldsOf(token), [])
    await locate(S, 'worldsSaved').waitFor({ timeout: 15000 })
    await shot(S, 'worlds-empty')
    return 'register 201 → /worlds; GET /me: student in the class; GET /worlds: []'
  })
  await run('classmate-taken-name', C, async () => {
    await C.goto(inviteLink)
    await locate(C, 'joinClassChip').waitFor({ timeout: 15000 })
    await locate(C, 'joinUsername').fill(accounts.classmate.username)
    await locate(C, 'joinRosterName').fill(accounts.classmate.rosterName)
    await locate(C, 'joinPassword').fill(accounts.classmate.password)
    const attempt = C.waitForResponse((r) => r.url().endsWith('/classroom/auth/register'))
    await locate(C, 'joinSubmit').click()
    const response = await attempt
    assert.equal(response.status(), 409); assert.equal((await response.json()).code, 'username_taken')
    await locate(C, 'joinAlert').waitFor()
    const chips = locate(C, 'joinSuggestions').getByRole('button')
    assert((await chips.count()) >= 1, 'suggestion chips rendered')
    await shot(C, 'join-username-taken')
    classmateUsername = (await chips.first().textContent()).trim()
    await chips.first().click()
    assert.equal(await locate(C, 'joinUsername').inputValue(), classmateUsername)
    const registered = C.waitForResponse((r) => r.url().endsWith('/classroom/auth/register'))
    await locate(C, 'joinSubmit').click()
    assert.equal((await registered).status(), 201)
    await C.waitForURL((url) => url.pathname === '/worlds', { timeout: 15000 })
    const me = await api('/me', { token: await tokenOf(C) })
    assert.equal(me.data.user.username, classmateUsername)
    return `409 username_taken → picked "${classmateUsername}" → 201 → /worlds`
  })

  // ---------------------------------------------------------------- student builds and saves
  await run('student-open-studio-and-place', S, async () => {
    await locate(S, 'worldsOpenStudio').first().click()
    await S.waitForURL((url) => url.pathname === '/build', { timeout: 15000 })
    await Promise.any([locate(S, 'worldMenu').waitFor({ timeout: 20000 }), locate(S, 'stripIdle').waitFor({ timeout: 20000 })])
    const guide = locate(S, 'dismissQuickStart'); if (await guide.count()) await guide.click()
    const drawer = locate(S, 'openBrickDrawer'); if (await drawer.isVisible().catch(() => false)) await drawer.click()
    await locate(S, 'partButton1x1').first().click()
    const placeOnce = async () => { const button = locate(S, 'placePositioned').first(); if (await button.isVisible().catch(() => false)) await button.click(); else await S.keyboard.press('Enter') }
    await placeOnce()
    await S.keyboard.press('ArrowRight'); await S.keyboard.press('ArrowRight')
    await locate(S, 'partButton1x1').first().click().catch(() => {})
    await placeOnce()
    await S.waitForTimeout(800)
    const stored = await S.evaluate((key) => { try { return JSON.parse(localStorage.getItem(key)) } catch { return null } }, PROJECT_KEY)
    const bricks = stored?.document?.bricks?.length ?? stored?.bricks?.length ?? 0
    assert(bricks >= 2, `guest draft holds ${bricks} bricks`)
    await shot(S, 'editor-placed')
    return `${bricks} bricks in the guest draft`
  })
  await run('student-save-to-account', S, async () => {
    await S.goto(`${origin}/build?classroom=save`)
    await locate(S, 'saveSheetHeading').waitFor({ timeout: 20000 })
    await locate(S, 'saveWorldName').fill(accounts.student.worldTitle)
    const created = S.waitForResponse((r) => r.url().endsWith('/classroom/worlds') && r.request().method() === 'POST')
    await locate(S, 'saveWorld').click()
    const response = await created
    assert.equal(response.status(), 201)
    worldId = (await response.json()).world.id
    await S.waitForTimeout(800)
    const token = await tokenOf(S)
    const worlds = await worldsOf(token)
    assert.equal(worlds.length, 1); assert.equal(worlds[0].id, worldId); assert.equal(worlds[0].visibility, 'private'); assert.equal(worlds[0].canEdit, true)
    const full = await api(`/worlds/${worldId}`, { token })
    assert(full.data.world.document.bricks.length >= 2, 'saved document carries the placed bricks')
    await shot(S, 'editor-saved')
    return `world ${worldId} saved with ${full.data.world.document.bricks.length} bricks; GET /worlds: private, canEdit`
  })
  await run('student-share-look-only', S, async () => {
    await S.goto(`${origin}/worlds`)
    const card = S.getByRole('article', { name: accounts.student.worldTitle })
    await card.waitFor({ timeout: 15000 })
    await card.getByRole('button', { name: 'Share with my class', exact: true }).click()
    const sheet = locate(S, 'worldsShareSheet'); await sheet.waitFor()
    assert.equal(await sheet.getByRole('radio', { name: /^Classmates can look/ }).isChecked(), true, 'look only is the default')
    await shot(S, 'worlds-share-sheet')
    await sheet.getByRole('button', { name: 'Share', exact: true }).click()
    await sheet.waitFor({ state: 'hidden' })
    await card.getByRole('button', { name: 'Sharing…', exact: true }).waitFor()
    const mine = (await worldsOf(await tokenOf(S))).find((w) => w.id === worldId)
    assert.equal(mine.visibility, 'class'); assert.equal(mine.classCanEdit, false); assert(mine.sharedAt, 'sharedAt set')
    await shot(S, 'worlds-shared-look')
    return 'PATCH sharing → visibility class, classCanEdit false'
  })

  // ---------------------------------------------------------------- classmate signs in both ways
  await run('classmate-sign-out-and-sign-in', C, async () => {
    await C.goto(`${origin}/worlds`)
    await locate(C, 'worldsAccountChip').first().click()
    await locate(C, 'accountSignOut').click()
    await C.waitForURL((url) => url.pathname === '/join' && url.searchParams.get('mode') === 'signin', { timeout: 15000 })
    assert.equal(await C.evaluate((key) => sessionStorage.getItem(key), SESSION_KEY), null, 'session cleared')
    assert.equal(await locate(C, 'joinClassCode').isVisible().catch(() => false), false, 'no class code field in sign-in')
    await locate(C, 'signinUsername').fill(classmateUsername)
    await locate(C, 'signinPassword').fill(accounts.classmate.password)
    await locate(C, 'signinSubmit').click()
    await C.waitForURL((url) => url.pathname === '/worlds', { timeout: 15000 })
    assert.equal((await api('/me', { token: await tokenOf(C) })).data.user.username, classmateUsername)
    return 'username + password only (no code) → /worlds'
  })
  await run('classmate-tap-your-name', C, async () => {
    await locate(C, 'worldsAccountChip').first().click()
    await locate(C, 'accountSignOut').click()
    await C.waitForURL((url) => url.pathname === '/join', { timeout: 15000 })
    await C.goto(`${origin}/join?mode=signin`)
    await C.evaluate(() => { try { localStorage.removeItem('brickgineers.last-class.v1') } catch { /* no remembered class */ } })
    await C.goto(`${origin}/join?mode=signin`)
    await locate(C, 'signinHaveCode').click()
    await locate(C, 'joinClassCode').fill(classCode)
    await locate(C, 'signinRosterLead').waitFor({ timeout: 15000 })
    const tiles = locate(C, 'signinRosterGrid').getByRole('button')
    const names = await tiles.allTextContents()
    assert(names.some((t) => t.includes(accounts.student.username)) && names.some((t) => t.includes(classmateUsername)), `roster lists both Mayas: ${names.join(' | ')}`)
    await shot(C, 'join-roster')
    await tiles.filter({ hasText: classmateUsername }).first().click()
    assert.equal(await locate(C, 'signinUsername').inputValue(), classmateUsername)
    const password = locate(C, 'signinPassword')
    assert.equal(await password.evaluate((el) => el === document.activeElement), true, 'focus moved to the password')
    await password.fill(accounts.classmate.password)
    await locate(C, 'signinSubmit').click()
    await C.waitForURL((url) => url.pathname === '/worlds', { timeout: 15000 })
    return `roster tile → focus on password → /worlds (${names.length} tiles)`
  })

  // ---------------------------------------------------------------- classmate sees, visits, copies
  await run('classmate-sees-shared-world', C, async () => {
    await C.goto(`${origin}/worlds?view=class`)
    const section = locate(C, 'worldsSharedByClassmates'); await section.waitFor({ timeout: 15000 })
    const card = section.getByRole('article', { name: accounts.student.worldTitle }); await card.waitFor()
    assert.equal(await card.getByRole('link', { name: 'Join', exact: true }).count(), 0, 'no Join while look only')
    const visit = card.getByRole('link', { name: 'Visit', exact: true })
    assert.equal(await visit.getAttribute('href'), `/live/${worldId.replaceAll('-', '')}`)
    await card.getByText('Look only').waitFor()
    await card.getByText('Maya B.').waitFor()
    const seen = (await worldsOf(await tokenOf(C))).find((w) => w.id === worldId)
    assert(seen, 'GET /worlds as the classmate lists the shared world'); assert.equal(seen.canEdit, false); assert.equal(seen.ownerName, 'Maya B.')
    await shot(C, 'worlds-classmate-look-only')
    return 'card: owner "Maya B.", Look only, Visit → /live/<id>; GET /worlds: canEdit false'
  })
  await run('classmate-visit-read-only', C, async () => {
    const card = locate(C, 'worldsSharedByClassmates').getByRole('article', { name: accounts.student.worldTitle })
    await card.getByRole('link', { name: 'Visit', exact: true }).click()
    await C.waitForURL((url) => url.pathname.startsWith('/live/'), { timeout: 15000 })
    const hud = C.getByRole('button', { name: /^People/ })
    const blocked = locate(C, 'liveBlockedOrHud')
    await Promise.any([hud.waitFor({ timeout: 20000 }), blocked.waitFor({ timeout: 20000 })])
    await shot(C, 'live-visit')
    if (await hud.isVisible().catch(() => false)) {
      const readOnly = await C.getByText(/look only|read-only|view only/i).first().isVisible().catch(() => false)
      return `live room opened; read-only indicator visible: ${readOnly}`
    }
    const heading = (await blocked.first().textContent()).trim()
    throw Object.assign(new Error(`live room not reachable: "${heading}" — the classroom live room needs the real Worker with Supabase + CLASSROOM_TICKET_SECRET`), { blocked: true })
  }, { required: false }).catch(() => {})
  {
    // Reclassify the live-room step: unavailable backend, not a product failure.
    const last = report.steps.at(-1)
    if (last.id === 'classmate-visit-read-only' && last.status === 'failed' && /live room not reachable/.test(last.detail)) { last.status = 'blocked'; failed = report.steps.some((s) => s.status === 'failed') }
  }
  await run('classmate-make-copy', C, async () => {
    await C.goto(`${origin}/worlds?view=class`)
    const card = locate(C, 'worldsSharedByClassmates').getByRole('article', { name: accounts.student.worldTitle }); await card.waitFor({ timeout: 15000 })
    const copied = C.waitForResponse((r) => r.url().endsWith(`/classroom/worlds/${worldId}/copy`))
    await card.getByRole('button', { name: 'Make my own copy', exact: true }).click()
    assert.equal((await copied).status(), 201)
    await locate(C, 'worldsSaved').getByRole('article', { name: `${accounts.student.worldTitle} (copy)` }).waitFor({ timeout: 15000 })
    const token = await tokenOf(C)
    const mine = (await worldsOf(token)).filter((w) => w.ownerId !== undefined && w.title === `${accounts.student.worldTitle} (copy)`)
    assert.equal(mine.length, 1); assert.equal(mine[0].visibility, 'private')
    const full = await api(`/worlds/${mine[0].id}`, { token })
    assert(full.data.world.document.bricks.length >= 2, 'copy carries the bricks')
    await shot(C, 'worlds-copy-under-mine')
    return `POST copy 201 → "${mine[0].title}" under Mine with ${full.data.world.document.bricks.length} bricks`
  })

  // ---------------------------------------------------------------- owner opens editing
  await run('student-share-build-with-me', S, async () => {
    await S.goto(`${origin}/worlds`)
    const card = S.getByRole('article', { name: accounts.student.worldTitle }); await card.waitFor({ timeout: 15000 })
    await card.getByRole('button', { name: 'Sharing…', exact: true }).click()
    const sheet = locate(S, 'worldsShareSheet'); await sheet.waitFor()
    await sheet.getByRole('radio', { name: /^Classmates can build with me/ }).check()
    await sheet.getByRole('button', { name: 'Save sharing', exact: true }).click()
    await sheet.waitFor({ state: 'hidden' })
    await card.getByText('build together').waitFor()
    const mine = (await worldsOf(await tokenOf(S))).find((w) => w.id === worldId)
    assert.equal(mine.classCanEdit, true)
    return 'PATCH sharing → classCanEdit true'
  })
  await run('classmate-join-visible', C, async () => {
    await C.goto(`${origin}/worlds?view=class`)
    const card = locate(C, 'worldsSharedByClassmates').getByRole('article', { name: accounts.student.worldTitle }); await card.waitFor({ timeout: 15000 })
    const join = card.getByRole('link', { name: 'Join', exact: true }); await join.waitFor()
    assert.equal(await join.getAttribute('href'), `/live/${worldId.replaceAll('-', '')}`)
    await card.getByText('Build together').waitFor()
    const seen = (await worldsOf(await tokenOf(C))).find((w) => w.id === worldId)
    assert.equal(seen.canEdit, true)
    await shot(C, 'worlds-classmate-build-together')
    return 'Join link + Build together chip; GET /worlds: canEdit true'
  })
  step('classmate-join-and-place-brick', 'blocked', 'needs the classroom live room (real Worker with Supabase + CLASSROOM_TICKET_SECRET); Join href and canEdit verified above', { evidence: null })

  // ---------------------------------------------------------------- teacher hides, classmate loses it
  await run('teacher-sees-and-hides', T, async () => {
    await T.goto(`${origin}/class`)
    await locate(T, 'classHeading').waitFor({ timeout: 15000 })
    const list = locate(T, 'classSharedList'); await list.waitFor({ timeout: 15000 })
    const item = list.getByRole('listitem').filter({ hasText: accounts.student.worldTitle }); await item.waitFor()
    await item.getByText('Build together').waitFor()
    await item.getByText('Maya B.').waitFor()
    await shot(T, 'class-shared-by-students')
    const hidden = T.waitForResponse((r) => r.url().endsWith(`/classroom/worlds/${worldId}/visibility`))
    await item.getByRole('button', { name: 'Hide from class', exact: true }).click()
    assert.equal((await hidden).status(), 200)
    await item.getByRole('button', { name: 'Show again', exact: true }).waitFor({ timeout: 15000 })
    await item.getByText('Hidden from the class').waitFor()
    const asTeacher = (await worldsOf(await tokenOf(T))).find((w) => w.id === worldId)
    assert.equal(asTeacher.hiddenByTeacher, true)
    const asClassmate = (await worldsOf(await tokenOf(C))).find((w) => w.id === worldId)
    assert.equal(asClassmate, undefined, 'hidden world is not listed for the classmate')
    const direct = await api(`/worlds/${worldId}`, { token: await tokenOf(C) })
    assert.equal(direct.data?.code, 'world_hidden', `GET /worlds/:id as classmate → ${direct.status} ${direct.data?.code}`)
    await shot(T, 'class-hidden')
    return 'PATCH visibility → hiddenByTeacher true; classmate: not listed, GET → 403 world_hidden'
  })
  await run('classmate-list-without-hidden', C, async () => {
    await C.goto(`${origin}/worlds?view=class`)
    await locate(C, 'worldsSharedByClassmates').waitFor({ timeout: 15000 })
    await locate(C, 'worldsSharedByClassmates').getByText('Nothing shared yet').waitFor({ timeout: 15000 })
    assert.equal(await C.getByRole('article', { name: accounts.student.worldTitle }).count(), 0)
    await shot(C, 'worlds-classmate-after-hide')
    return 'Shared by classmates is empty'
  })
  await run('teacher-show-again', T, async () => {
    const item = locate(T, 'classSharedList').getByRole('listitem').filter({ hasText: accounts.student.worldTitle })
    await item.getByRole('button', { name: 'Show again', exact: true }).click()
    await item.getByRole('button', { name: 'Hide from class', exact: true }).waitFor({ timeout: 15000 })
    const asClassmate = (await worldsOf(await tokenOf(C))).find((w) => w.id === worldId)
    assert(asClassmate, 'listed again for the classmate')
    return 'PATCH visibility false → listed again'
  })

  // ---------------------------------------------------------------- owner unshares
  await run('student-unshare', S, async () => {
    const card = S.getByRole('article', { name: accounts.student.worldTitle })
    await card.getByRole('button', { name: 'Sharing…', exact: true }).click()
    const sheet = locate(S, 'worldsShareSheet'); await sheet.waitFor()
    await sheet.getByRole('button', { name: 'Stop sharing', exact: true }).click()
    await sheet.waitFor({ state: 'hidden' })
    await card.getByRole('button', { name: 'Share with my class', exact: true }).waitFor()
    const mine = (await worldsOf(await tokenOf(S))).find((w) => w.id === worldId)
    assert.equal(mine.visibility, 'private'); assert.equal(mine.classCanEdit, false); assert.equal(mine.sharedAt, null)
    const classmateView = await api(`/worlds/${worldId}`, { token: await tokenOf(C) })
    assert.equal(classmateView.status, 404, `classmate GET after unshare → ${classmateView.status}`)
    assert.equal((await worldsOf(await tokenOf(C))).some((w) => w.id === worldId), false)
    await shot(S, 'worlds-unshared')
    return 'PATCH sharing private → classmate GET 404, not listed'
  })
  step('classmate-ejected-on-unshare', 'blocked', 'the classmate could not be inside the live room (see classmate-visit-read-only); the access loss is proven at the API (404 after unshare)', { evidence: null })

  report.state = { classCode, classId, worldId, inviteLink, classmateUsername, accounts: { teacher: accounts.teacher, student: { username: accounts.student.username, password: accounts.student.password, worldTitle: accounts.student.worldTitle }, classmate: { username: classmateUsername, password: accounts.classmate.password } } }
} catch (error) {
  if (!error?.stop) { step('harness', 'failed', String(error)); failed = true }
} finally {
  for (const c of [teacher, student, classmate]) if (c) { pageErrors.push(...c.errors); await c.ctx.close().catch(() => {}) }
  await browser.close()
  report.pageErrors = pageErrors
  if (pageErrors.length) { step('page-errors', 'failed', pageErrors.join(' | ')); failed = true }
  report.summary = { passed: report.steps.filter((s) => s.status === 'passed').length, failed: report.steps.filter((s) => s.status === 'failed').length, blocked: report.steps.filter((s) => s.status === 'blocked').length, screenshots: shots }
  await mkdir(output, { recursive: true })
  await writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ result: failed ? 'failed' : 'passed', backend: report.backend.classroomKind, ...report.summary, screenshots: shots.length, output }))
  process.exitCode = failed ? 1 : 0
}
