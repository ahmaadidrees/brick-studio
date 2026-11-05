/**
 * Wave 2 integration (docs/qa/wave2-int, section 6): a Hackable class room with real sign-ins, against the staging
 * Worker and the database it uses. Approved by the owner on 2026-11-04 for one throwaway class, two test students and
 * one shared Hackable project, made with the dedicated test teacher.
 *
 *   node scripts/qa/wave2-classroom.mjs setup     makes the class, the two students and the project, once
 *   node scripts/qa/wave2-classroom.mjs run       the checks (repeatable; makes nothing new)
 *   node scripts/qa/wave2-classroom.mjs cleanup   switches the students off and closes the class
 *
 * Secrets never leave this process: the teacher's login comes from the environment (`.env.classroom-qa.local`, loaded
 * by the calling shell), the students' generated passwords live only in a mode-0600 state file outside the repository
 * (W2_STATE) until cleanup deletes it, and every browser gets its sign-in as session storage, never typed into a page.
 * Reports and screenshots hold ids and names only.
 *
 * Environment: CLASSROOM_TEST_API (the staging Worker), CLASSROOM_TEST_TEACHER_EMAIL, CLASSROOM_TEST_TEACHER_PASSWORD,
 * CLASSROOM_TEST_ALLOW_FIXTURES=yes, UI_ORIGIN (vite dev pointed at the same Worker: .claude/launch.json
 * w2-app-staging), W2_STATE, UI_OUTPUT.
 */
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { chmod, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchOptions, loadChromium, localOrigin, outputDir } from './lib/env.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const phase = process.argv[2]
for (const key of ['CLASSROOM_TEST_API', 'CLASSROOM_TEST_TEACHER_EMAIL', 'CLASSROOM_TEST_TEACHER_PASSWORD', 'W2_STATE']) assert(process.env[key], `Missing ${key}`)
assert(process.env.CLASSROOM_TEST_ALLOW_FIXTURES === 'yes', 'Explicit fixture creation flag required')
const api = process.env.CLASSROOM_TEST_API.replace(/\/$/, '')
const statePath = process.env.W2_STATE

async function request(p, { method = 'GET', body, token, statuses = [200] } = {}) {
  const response = await fetch(`${api}/classroom/${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5274', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(45_000),
  })
  const data = await response.json().catch(() => ({}))
  assert(statuses.includes(response.status), `${method} ${p.replace(/[0-9a-f-]{36}/g, '<id>')}: ${response.status} ${data.code ?? data.error ?? ''}`)
  return data
}
const teacherLogin = () => request('auth/teacher-login', { method: 'POST', body: { email: process.env.CLASSROOM_TEST_TEACHER_EMAIL, password: process.env.CLASSROOM_TEST_TEACHER_PASSWORD } })
const readState = async () => JSON.parse(await readFile(statePath, 'utf8'))
const saveState = async (state) => { await writeFile(statePath, JSON.stringify(state), { mode: 0o600 }); await chmod(statePath, 0o600) }
const studentLogin = (state, s) => request('auth/login', { method: 'POST', body: { classCode: state.loginCode, username: s.username, password: s.password } })

// ------------------------------------------------------------------------------------------------ setup

if (phase === 'setup') {
  const existing = await readState().catch(() => null)
  assert(!existing, 'Already set up: reuse it (run) or clean up first.')
  const run = `w2qa${Date.now().toString(36)}`
  const teacher = await teacherLogin()
  const cls = (await request('classes', { method: 'POST', token: teacher.session.accessToken, body: { name: `Wave 2 QA ${run}` }, statuses: [200, 201] })).class
  const state = { run, classId: cls.id, enrollCode: cls.code, loginCode: cls.loginCode, students: [], worldId: null }
  await saveState(state)
  for (const [suffix, roster] of [['a', 'Wave2 QA Ana'], ['b', 'Wave2 QA Ben']]) {
    const password = `Qa!${randomBytes(18).toString('hex')}`
    const made = await request('auth/register', { method: 'POST', body: { classCode: cls.code, username: `${run}${suffix}`, password, rosterName: roster }, statuses: [201] })
    state.students.push({ id: made.user.id, username: `${run}${suffix}`, name: roster, password })
    await saveState(state)
  }
  console.log(JSON.stringify({ made: { classId: state.classId, students: state.students.map((s) => ({ id: s.id, username: s.username })) } }))
  process.exit(0)
}

// ------------------------------------------------------------------------------------------------ cleanup

if (phase === 'cleanup') {
  const state = await readState()
  const teacher = await teacherLogin()
  const token = teacher.session.accessToken
  for (const s of state.students) await request(`classes/${state.classId}/students/${s.id}`, { method: 'PATCH', token, body: { suspended: true } })
  await request(`classes/${state.classId}`, { method: 'PATCH', token, body: { enrollmentOpen: false, collaborationOpen: false } })
  const roster = (await request(`classes/${state.classId}/students`, { token })).students
  const summary = { classId: state.classId, worldId: state.worldId, students: roster.map((s) => ({ id: s.id, username: s.username, suspended: !!s.suspended })) }
  await rm(statePath)
  console.log(JSON.stringify({ cleaned: summary }))
  process.exit(0)
}

// ------------------------------------------------------------------------------------------------ run

assert.equal(phase, 'run', 'phase: setup | run | cleanup')
const origin = localOrigin('UI_ORIGIN', 'http://localhost:5274', 'the harness signs test accounts in here.')
const output = await outputDir('UI_OUTPUT', path.join(here, '../../docs/qa/wave2-int/shots/classroom'))
const state = await readState()
const chromium = await loadChromium()
const browser = await chromium.launch(launchOptions())
const report = { classId: state.classId, steps: [] }
let failed = 0

async function step(name, fn) {
  try {
    const detail = await fn()
    report.steps.push({ name, ok: true, ...(detail !== undefined ? { detail } : {}) })
    console.log(`ok   ${name}${detail !== undefined ? `  ${JSON.stringify(detail).slice(0, 300)}` : ''}`)
  } catch (error) {
    failed++
    report.steps.push({ name, ok: false, error: String(error?.message ?? error).slice(0, 500) })
    console.log(`FAIL ${name}: ${String(error?.message ?? error).slice(0, 500)}`)
  }
}
async function until(page, fn, arg, what, ms = 20000) {
  const start = Date.now()
  for (;;) {
    if (await page.evaluate(fn, arg).catch(() => false)) return
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`)
    await page.waitForTimeout(200)
  }
}
async function until2(fn, what, ms = 30000) {
  const start = Date.now()
  for (;;) {
    const v = await fn().catch(() => null)
    if (v) return v
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`)
    await new Promise((r) => setTimeout(r, 1000))
  }
}
/** A signed-in kid or teacher: their own browser context, signed in through storage (no password on a page). */
async function person(name, auth) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await context.addInitScript((value) => {
    if (!sessionStorage.getItem('w2-signed-in')) {
      sessionStorage.setItem('brick-studio.classroom-session.v1', value)
      sessionStorage.setItem('w2-signed-in', '1')
    }
  }, JSON.stringify(auth))
  const page = await context.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e.message ?? e).slice(0, 300)}`))
  return { name, context, page, errors }
}
const shot = (k, name) => k.page.screenshot({ path: path.join(output, `${name}.jpg`), type: 'jpeg', quality: 76 })
const room = (page) => page.evaluate(() => {
  const s = window.__hackableRoom
  if (!s) return null
  const w = s.runtime?.world
  return {
    tick: s.timeline?.tick ?? null, me: s.view.me, host: s.view.host, build: s.view.build, code: s.view.code, status: s.view.status, classroom: s.view.classroom,
    notice: s.view.notice, stats: { ...s.stats }, rejected: s.rejected,
    players: (w?.players ?? []).map((p) => p.name), history: s.view.history.map((h) => `${h.name} ${h.summary}`),
    copies: w?.design?.copies.length ?? 0,
  }
})
const at = (page, x, y) => page.evaluate(([wx, wy]) => window.__studioStage?.toScreen(wx, wy) ?? null, [x, y])
const tapAt = async (page, x, y) => { const p = await at(page, x, y); if (!p) throw new Error('no stage'); await page.mouse.click(p.x, p.y) }
/** The project as the account has it now (the owner's API view): its revision and design. */
async function accountWorld(token) {
  const world = (await request(`worlds/${state.worldId}`, { token })).world
  const doc = world.document
  const design = doc?.save?.design ?? doc?.design ?? null
  return { revision: world.revision, design, document: doc }
}
const IGNORED = [/favicon/i, /Download the React DevTools/]

const ana0 = await studentLogin(state, state.students[0])
const ben0 = await studentLogin(state, state.students[1])
const teacher0 = await teacherLogin()
const ana = await person('Ana', ana0)
const ben = await person('Ben', ben0)
const teacher = await person('Teacher', teacher0)
const kids = [ana, ben, teacher]
const anaToken = ana0.session.accessToken

try {
  await step('Ana (signed in) has the class project: made in her studio once, then reopened', async () => {
    if (!state.worldId) {
      await ana.page.goto(`${origin}/2d/hackable?new=1`)
      await until(ana.page, () => !!window.__studio, null, 'Ana\'s studio', 30000)
      // Parity B's bricks along the way, so the room has the new bricks too.
      await ana.page.evaluate(() => {
        const s = window.__studio
        for (const [id, x, y] of [['brick_checkpoint', 200, 32], ['brick_spiky', 620, 40], ['brick_platform', 380, 130]]) { const b = s.addCatalogBrick(id); if (b) s.addCopy(b, x, y) }
      })
      await ana.page.waitForURL(/[?&]world=/, { timeout: 30000 })
      state.worldId = new URL(ana.page.url()).searchParams.get('world')
      await saveState(state)
      await request(`worlds/${state.worldId}/sharing`, { method: 'PATCH', token: anaToken, body: { visibility: 'class', canEdit: true } })
    }
    await ana.page.goto(`${origin}/2d/hackable?world=${state.worldId}`)
    await until(ana.page, () => !!window.__studio, null, 'Ana\'s studio', 30000)
    await ana.page.waitForTimeout(2500)
    const w = await accountWorld(anaToken)
    return { worldId: state.worldId, revision: w.revision, kit: w.design?.kit ?? 'platformer', bricks: w.design?.bricks.length }
  })
  report.worldId = state.worldId
  let revisionBefore = 0

  await step('Ana: This project → Play together opens the class room, and her studio stops saving on its own', async () => {
    revisionBefore = (await accountWorld(anaToken)).revision
    await ana.page.getByRole('button', { name: /This project/ }).click()
    await ana.page.getByRole('menuitem', { name: /Play together/ }).click()
    await until(ana.page, () => (window.__hackableRoom?.timeline?.tick ?? 0) > 30, null, 'the class room', 30000)
    const chip = await ana.page.getByText('The room saves this project for everyone while you play together.').count()
    const r = await room(ana.page)
    if (!r.classroom || !r.host) throw new Error(JSON.stringify(r))
    return { classroom: r.classroom, host: r.host, chipSaysRoomSaves: chip > 0 }
  })
  await shot(ana, '1-ana-class-room')

  for (const k of [ben, teacher]) {
    await step(`${k.name} opens /2d/hackable/w/<world> and joins`, async () => {
      await k.page.goto(`${origin}/2d/hackable/w/${state.worldId}`)
      const join = k.page.getByRole('button', { name: /^(Join|Rejoin|Play|Open)/ })
      if (await join.first().isVisible({ timeout: 8000 }).catch(() => false)) await join.first().click()
      await until(k.page, () => (window.__hackableRoom?.timeline?.tick ?? 0) > 30, null, 'the class room', 30000)
      const r = await room(k.page)
      return { host: r.host, build: r.build, code: r.code, players: r.players }
    })
  }
  await ana.page.waitForTimeout(1500)
  await shot(ben, '2-ben-joined')

  await step('Ben (a classmate) builds by default: a Coin from the drawer reaches everyone', async () => {
    const r0 = await room(ben.page)
    if (!r0.build || r0.code) throw new Error(`build ${r0.build} code ${r0.code}`)
    const before = (await room(ana.page)).history.length
    await ben.page.getByRole('radio', { name: /Build/ }).click()
    await ben.page.getByRole('region', { name: 'Bricks' }).getByRole('button', { name: /^Coin\b/ }).first().click()
    await tapAt(ben.page, 300, 120)
    await ben.page.keyboard.press('Escape')
    await until(ana.page, (n) => (window.__hackableRoom?.view.history.length ?? 0) > n, before, 'Ben\'s edit in Ana\'s history')
    await ana.page.waitForTimeout(800)
    const rs = await Promise.all(kids.map((k) => room(k.page)))
    if (new Set(rs.map((r) => r.copies)).size !== 1) throw new Error(`copies ${rs.map((r) => r.copies)}`)
    return { history: rs[0].history.slice(-1), copies: rs[0].copies }
  })

  await step('Ben\'s code waits for the host; the teacher lets him; he presses Code at once and nothing is sent', async () => {
    const codeTab = ben.page.getByRole('radio', { name: /Code/ })
    const closed = await codeTab.isDisabled()
    const before = (await room(ana.page)).history.length
    await teacher.page.getByRole('button', { name: 'Room', exact: true }).click()
    await teacher.page.getByRole('menuitem', { name: /^Let .* change code$/ }).first().click()
    await until(ben.page, () => window.__hackableRoom?.view.code === true, null, 'Ben may code')
    await codeTab.click({ timeout: 15000 })
    await ben.page.waitForTimeout(3000)
    const after = await room(ana.page)
    if (after.history.length !== before) throw new Error(`opening Code sent: ${after.history.slice(before)}`)
    return { closedBefore: closed, nothingSent: true }
  })

  await step('Ben switches a script off in Code: a live code edit everyone hears', async () => {
    await ben.page.getByRole('region', { name: 'In this level' }).getByRole('listitem').filter({ hasText: 'Moving platform' }).first().click()
    await ben.page.waitForTimeout(800)
    const sw = ben.page.locator('.code-script-switch').first()
    await sw.waitFor({ timeout: 10000 })
    await sw.dispatchEvent('click')
    await until(teacher.page, () => /changed .*code/.test(window.__hackableRoom?.view.notice ?? ''), null, 'the teacher hears it')
    return { notice: (await room(teacher.page)).notice }
  })
  await shot(teacher, '3-teacher-notice')

  let saved
  await step('Write-behind: the room saves the edits to the class project (the account has Ben\'s Coin and code)', async () => {
    saved = await until2(async () => {
      const w = await accountWorld(anaToken)
      const coins = w.design?.copies.filter((c) => c.brickId === 'brick_coin').length ?? 0
      return w.revision > revisionBefore && coins > 0 ? w : null
    }, 'a newer class project revision', 45000)
    const room0 = await ana.page.evaluate(() => window.__hackableRoom.runtime.world.design)
    const platform = (d) => JSON.stringify(d.bricks.find((b) => b.id === 'brick_platform')?.program)
    return { revision: `${revisionBefore} → ${saved.revision}`, codeSaved: platform(saved.design) === platform(room0), copies: saved.design.copies.length }
  })

  await step('A save from elsewhere meanwhile leaves a recovery copy; the room\'s version is saved over it', async () => {
    const now = await accountWorld(anaToken)
    // "Elsewhere": the owner's account saved directly (another tab or device), renaming the project.
    const doc = structuredClone(now.document)
    const design = doc.save?.design ?? doc.design
    design.name = 'Saved elsewhere'
    await request(`worlds/${state.worldId}`, { method: 'PUT', token: anaToken, body: { expectedRevision: now.revision, document: doc } })
    // Then the room has more to save: Ben places another Coin.
    await ben.page.getByRole('radio', { name: /Build/ }).click()
    await ben.page.getByRole('region', { name: 'Bricks' }).getByRole('button', { name: /^Coin\b/ }).first().click()
    await tapAt(ben.page, 340, 120)
    await ben.page.keyboard.press('Escape')
    const recovery = await until2(async () => {
      const r = await request(`worlds/${state.worldId}/hackable-recovery`, { token: anaToken })
      const list = r.copies ?? r.recovery ?? r.items ?? r
      return Array.isArray(list) && list.length ? list : null
    }, 'a recovery copy', 60000)
    const after = await until2(async () => { const w = await accountWorld(anaToken); return w.design?.name !== 'Saved elsewhere' && w.revision > now.revision + 1 ? w : null }, 'the room saving over it', 45000)
    const teacherSees = await request(`worlds/${state.worldId}/hackable-recovery`, { token: teacher0.session.accessToken })
    return { recoveryCopies: recovery.length, firstCopy: Object.keys(recovery[0]).slice(0, 6), accountName: after.design.name, teacherCanRead: !!teacherSees }
  })

  await step('No resyncs or refused edits; every browser agrees', async () => {
    await ana.page.waitForTimeout(2500)
    const rs = await Promise.all(kids.map((k) => room(k.page)))
    const top = Math.min(...rs.map((r) => r.tick)) - 30
    const ticks = Array.from({ length: 10 }, (_, i) => Math.floor((top - i * 60) / 60) * 60).filter((t) => t > 0)
    const prints = await Promise.all(kids.map((k) => k.page.evaluate((ts) => ts.map((t) => window.__hackableRoom.fingerprintAt(t)), ticks)))
    const compared = ticks.filter((_, i) => prints.every((p) => p[i] !== null))
    const differ = compared.filter((t) => { const i = ticks.indexOf(t); return !prints.every((p) => p[i] === prints[0][i]) })
    if (!compared.length || differ.length) throw new Error(`compared ${compared.length}, differ ${differ}`)
    if (rs.some((r) => r.stats.resyncs > 0)) throw new Error(`resyncs ${rs.map((r) => r.stats.resyncs)}`)
    return { compared: compared.length, resyncs: rs.map((r) => r.stats.resyncs), rewinds: rs.map((r) => r.stats.rewinds), rejected: rs.map((r) => r.rejected), history: rs[0].history }
  })
  await shot(ana, '4-ana-room-after-edits')

  await step('Ana stops playing together: her studio resumes from the account\'s newest version and saves again', async () => {
    await ana.page.getByRole('button', { name: /Stop playing together/ }).click()
    await ana.page.waitForTimeout(2500)
    const latest = await accountWorld(anaToken)
    const mine = await ana.page.evaluate(() => window.__studio.getState().project.design)
    const coinsMine = mine.copies.filter((c) => c.brickId === 'brick_coin').length
    const coinsAccount = latest.design.copies.filter((c) => c.brickId === 'brick_coin').length
    if (coinsMine !== coinsAccount) throw new Error(`studio coins ${coinsMine}, account ${coinsAccount}`)
    // Her own edit after the room saves to the account again.
    await ana.page.evaluate(() => window.__studio.renameProject('After the room'))
    const resumed = await until2(async () => { const w = await accountWorld(anaToken); return w.design?.name === 'After the room' ? w : null }, 'Ana\'s own save after the room', 45000)
    return { coinsInStudio: coinsMine, revision: `${latest.revision} → ${resumed.revision}` }
  })

  await step('An account reload shows the room\'s edits', async () => {
    await ana.page.reload()
    await until(ana.page, () => !!window.__studio, null, 'the studio after reload', 30000)
    await ana.page.waitForTimeout(1500)
    const d = await ana.page.evaluate(() => window.__studio.getState().project.design)
    const coins = d.copies.filter((c) => c.brickId === 'brick_coin').length
    if (coins < 1 || d.name !== 'After the room') throw new Error(`coins ${coins}, name ${d.name}`)
    return { coins, name: d.name }
  })
  await shot(ana, '5-ana-after-reload')

  await step('No console errors in any browser', async () => {
    const errs = kids.flatMap((k) => k.errors.map((e) => `${k.name}: ${e}`)).filter((e) => !IGNORED.some((re) => re.test(e)))
    if (errs.length) throw new Error(errs.slice(0, 5).join(' | '))
  })
} finally {
  for (const k of kids) await k.context.close()
  await browser.close()
}
await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(`\n${failed ? `${failed} step(s) failed` : 'all steps passed'}; report and screenshots in ${output}`)
process.exit(failed ? 1 : 0)
