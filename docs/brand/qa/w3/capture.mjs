// W3 board captures: boards 03, 04, 05, 13, 14, 15 (account-owned states) and 16 (sign-in / keyboard).
// Guest views (03, 04 callback) are the real app. Signed-in views seed a session in sessionStorage and answer
// /classroom/* from fixtures with page.route, so no server or live data is involved.
//
//   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//   UI_ORIGIN=http://127.0.0.1:5193 node docs/brand/qa/w3/capture.mjs
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const origin = process.env.UI_ORIGIN || 'http://127.0.0.1:5193'
const out = path.resolve('docs/brand/qa/w3')
await mkdir(out, { recursive: true })

const SESSION_KEY = 'brick-studio.classroom-session.v1'
const FLOW_KEY = 'brick-studio.teacher-google.v1'
const session = { accessToken: 'qa-access', refreshToken: 'qa-refresh', expiresIn: 3600 }
const student = { user: { id: 's1', username: 'sky_builder', rosterName: 'Alex R.', role: 'student', resetRequired: false }, classes: [], session }
const teacher = { user: { id: 't1', username: 'ms_carter', rosterName: 'Ms. Carter', role: 'teacher', resetRequired: false }, classes: [], session }
const studio5 = { id: 'class1', name: 'Studio 5', loginCode: 'CLASS-456', code: 'NEW-123', enrollmentOpen: true, collaborationOpen: true }
const at = (daysAgo) => new Date(Date.UTC(2026, 8, 14 - daysAgo, 15, 0, 0)).toISOString()
const worlds = [
  { id: 'w1', title: 'Desk Castle', ownerId: 's1', classId: null, kind: 'personal', revision: 12, updatedAt: at(0) },
  { id: 'w2', title: 'Sky Steps', ownerId: 's1', classId: null, kind: 'personal', revision: 4, updatedAt: at(3) },
  { id: 'w3', title: 'Rainbow Bridge', ownerId: 's1', classId: null, kind: 'personal', revision: 7, updatedAt: at(9) },
  { id: 'c1', title: 'Our Class City', ownerId: 't1', classId: 'class1', kind: 'class', revision: 30, updatedAt: at(1) },
  { id: 'g1', title: 'Bridge Team', ownerId: 't1', classId: 'class1', kind: 'group', revision: 9, updatedAt: at(2) },
]
const roster = [
  { id: 's1', username: 'sky_builder', rosterName: 'Alex R.', suspended: false, resetRequired: false },
  { id: 's2', username: 'comet_maker', rosterName: 'Sam K.', suspended: false, resetRequired: false },
  { id: 's3', username: 'sunny_blocks', rosterName: 'Jamie L.', suspended: false, resetRequired: true },
  { id: 's4', username: 'quiet_one', rosterName: 'Riley P.', suspended: true, resetRequired: false },
]
const members = [{ id: 's1', username: 'sky_builder', rosterName: 'Alex R.' }, { id: 's2', username: 'comet_maker', rosterName: 'Sam K.' }]
const checkpoints = [{ id: 'cp1', revision: 8, createdAt: at(1), reason: 'saved' }, { id: 'cp2', revision: 5, createdAt: at(4), reason: 'saved' }]

const results = []
const record = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`) }

async function mockApi(page, data = {}) {
  // The API is served at /classroom/* on the origin root; Vite's own /src/classroom/* module URLs must pass through.
  await page.route((url) => url.pathname.startsWith('/classroom/'), (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const apiPath = url.pathname.replace(/^.*\/classroom/, '')
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (data.status) return json({ error: data.error, code: 'qa' }, data.status)
    if (data.abort) return route.abort('failed')
    if (apiPath === '/worlds') return json({ worlds: data.worlds ?? [] })
    if (apiPath === '/classes') return json({ classes: data.classes ?? [] })
    if (apiPath.endsWith('/students')) return json({ students: data.students ?? [] })
    if (apiPath.endsWith('/members')) return json({ members: data.members ?? [] })
    if (apiPath.endsWith('/checkpoints')) return json({ checkpoints: data.checkpoints ?? [] })
    return json({ error: `Unhandled ${request.method()} ${apiPath}` }, 500)
  })
}

async function open(browser, { viewport, mobile = false, auth = null, api = null, flow = null, hold = null, url = '/build?classroom=signin' }) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: 'light' })
  await context.addInitScript(([sessionKey, flowKey, session, pending]) => {
    if (session) sessionStorage.setItem(sessionKey, JSON.stringify(session))
    if (pending) sessionStorage.setItem(flowKey, JSON.stringify(pending))
  }, [SESSION_KEY, FLOW_KEY, auth, flow])
  const page = await context.newPage()
  if (api) await mockApi(page, api)
  if (hold) await page.route((target) => target.pathname === hold, () => { /* never answer: hold the pending state */ })
  await page.goto(`${origin}${url}`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => document.fonts.ready)
  return { context, page }
}

async function shot(page, name, selector = '[role="dialog"], main.classroom-page') {
  await page.locator(selector).first().waitFor({ state: 'visible' })
  await page.waitForTimeout(250)
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: false })
  console.log(`saved ${name}.png`)
}

/** Every visible control inside the dialog must be at least 44px tall on touch layouts (W8 D7). */
async function touchTargets(page, label) {
  const short = await page.evaluate(() => Array.from(document.querySelectorAll('[role="dialog"] button, [role="dialog"] input, [role="dialog"] select, [role="dialog"] a[href], [role="dialog"] [role="radio"]'))
    .filter((el) => el.getClientRects().length > 0)
    .map((el) => ({ name: (el.getAttribute('aria-label') || el.textContent || el.id || el.tagName).trim().slice(0, 40), h: Math.round(el.getBoundingClientRect().height), w: Math.round(el.getBoundingClientRect().width) }))
    .filter((t) => t.h < 44))
  record(`D7 touch targets >= 44px (${label})`, short.length === 0, short.map((t) => `${t.name} ${t.w}x${t.h}`).join(', '))
}

const inViewport = async (page, locator) => {
  const box = await locator.boundingBox()
  const size = page.viewportSize()
  return Boolean(box && box.y >= 0 && box.x >= 0 && box.y + box.height <= size.height && box.x + box.width <= size.width)
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true })
try {
  const desktop = { width: 1366, height: 768 }
  const phone = { width: 390, height: 844 }
  const narrow = { width: 320, height: 740 }

  // ---- Board 03: real guest entry views ----------------------------------------------------------------
  for (const [name, viewport, mobile] of [['1366', desktop, false], ['390', phone, true]]) {
    let { context, page } = await open(browser, { viewport, mobile, url: '/build?classroom=signin' })
    await page.getByLabel('Class sign-in code', { exact: true }).fill('AB7X')
    await page.getByLabel('Username', { exact: true }).fill('riverbuilds')
    await page.getByLabel('Password', { exact: true }).fill('secret-password')
    record(`03 labels stay visible with text (${name})`, await page.getByText('Class sign-in code', { exact: true }).isVisible() && await page.getByText('Username', { exact: true }).isVisible())
    record(`03 primary action inside the viewport (${name})`, await inViewport(page, page.getByRole('button', { name: 'Sign in' })))
    await shot(page, `03-signin-student-${name}`)
    if (mobile) await touchTargets(page, '03 student 390')
    await page.getByRole('radio', { name: 'Join a class' }).click()
    await shot(page, `03-signin-enroll-${name}`)
    if (mobile) { await touchTargets(page, '03 enroll 390'); await page.getByRole('radio', { name: 'Teacher' }).click(); await page.getByRole('button', { name: 'Use email and password' }).click(); await touchTargets(page, '03 teacher 390') }
    if (!mobile) {
      await page.getByRole('radio', { name: 'Teacher' }).click()
      await page.getByRole('button', { name: 'Use email and password' }).click()
      await shot(page, `03-signin-teacher-${name}`)
      // Escape closes to the current build and strips the intent.
      await page.keyboard.press('Escape')
      await page.waitForTimeout(200)
      record('03 Escape closes the panel to the build', (await page.locator('[role="dialog"][aria-modal="true"]').count()) === 0 && !page.url().includes('classroom='), page.url())
    }
    await context.close()
    // Invalid credentials against a mocked 401.
    ;({ context, page } = await open(browser, { viewport, mobile, api: { status: 401, error: 'Check your class code, username and password.' }, url: '/build?classroom=signin' }))
    await page.getByLabel('Class sign-in code', { exact: true }).fill('AB7X')
    await page.getByLabel('Username', { exact: true }).fill('riverbuilds')
    await page.getByLabel('Password', { exact: true }).fill('not-the-one')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('alert').waitFor()
    if (!mobile) await shot(page, `03-signin-invalid-${name}`)
    record(`03 invalid credentials keep typed details (${name})`, (await page.getByLabel('Username', { exact: true }).inputValue()) === 'riverbuilds')
    await context.close()
  }
  // 320×740: footer reachable, enrollment field rules visible.
  {
    const { context, page } = await open(browser, { viewport: narrow, mobile: true, url: '/build?classroom=join' })
    await page.getByLabel('Enrollment code', { exact: true }).fill('NEW-123')
    await page.getByLabel('Choose a username', { exact: true }).fill('_leading')
    await page.getByLabel('Name your teacher knows', { exact: true }).fill('River')
    await page.getByLabel('Choose a password', { exact: true }).fill('remember-this')
    record('03 primary action inside the viewport (320)', await inViewport(page, page.getByRole('button', { name: 'Create account and join' })))
    await page.getByRole('button', { name: 'Create account and join' }).click()
    await page.getByRole('alert').waitFor()
    await shot(page, '03-signin-enroll-320')
    await context.close()
  }
  // Board 16: sign-in with the on-screen keyboard open (visual viewport ~ 390×470).
  {
    const { context, page } = await open(browser, { viewport: { width: 390, height: 470 }, mobile: true, url: '/build?classroom=signin' })
    await page.getByLabel('Class sign-in code', { exact: true }).fill('AB7X')
    await page.getByLabel('Username', { exact: true }).fill('riverbuilds')
    const password = page.getByLabel('Password', { exact: true })
    await password.focus()
    await password.fill('secret-1')
    await page.waitForTimeout(250)
    record('16 focused field stays visible with the keyboard open', await inViewport(page, password))
    record('16 primary action stays visible with the keyboard open', await inViewport(page, page.getByRole('button', { name: 'Sign in' })))
    await shot(page, '16-signin-keyboard-390')
    await context.close()
  }

  // ---- Board 04: forced password change, save hand-off, callback pending/failure ----------------------
  for (const [name, viewport, mobile] of [['1366', desktop, false], ['390', phone, true]]) {
    let { context, page } = await open(browser, { viewport, mobile, auth: { ...student, user: { ...student.user, resetRequired: true } }, api: {}, url: '/build?classroom=worlds' })
    await page.getByLabel('New password', { exact: true }).fill('new-password')
    await page.getByLabel('Repeat new password', { exact: true }).fill('different')
    await page.getByRole('button', { name: 'Set new password' }).click()
    await page.getByRole('alert').waitFor()
    await shot(page, `04-recovery-reset-${name}`)
    await context.close()
    ;({ context, page } = await open(browser, { viewport, mobile, auth: student, api: { worlds: worlds.filter((w) => w.kind === 'personal') }, url: '/build?classroom=save' }))
    await page.getByLabel('World name', { exact: true }).fill('Desk Castle')
    await page.locator('[role="dialog"] .classroom-warning').waitFor()
    await shot(page, `04-recovery-save-${name}`)
    await context.close()
  }
  {
    const pending = { state: 'qa-state', verifier: 'qa-verifier', startedAt: Date.now(), returnTo: '/build?classroom=teacher', accountId: null }
    let { context, page } = await open(browser, { viewport: desktop, flow: pending, hold: '/classroom/auth/teacher-google', url: '/auth/teacher-callback?state=qa-state&code=qa-code' })
    await page.getByRole('status').waitFor()
    await shot(page, '04-callback-pending-1366')
    await context.close()
    ;({ context, page } = await open(browser, { viewport: desktop, url: '/auth/teacher-callback?state=stale&code=x' }))
    await page.getByRole('alert').waitFor()
    record('04 callback failure keeps Try again and Keep building', (await page.getByRole('link', { name: 'Try again' }).count()) === 1 && (await page.getByRole('link', { name: 'Keep building' }).count()) === 1)
    await shot(page, '04-callback-failed-1366')
    await context.close()
  }

  // ---- Board 05: My Worlds / My Class -----------------------------------------------------------------
  for (const [name, viewport, mobile] of [['1366', desktop, false], ['390', phone, true]]) {
    let { context, page } = await open(browser, { viewport, mobile, auth: student, api: { worlds, classes: [studio5] }, url: '/build?classroom=worlds' })
    await page.getByRole('article', { name: 'Desk Castle' }).waitFor()
    record(`05 no img thumbnails (${name})`, (await page.locator('[role="dialog"] img').count()) === 0)
    await shot(page, `05-worlds-${name}`)
    if (mobile) await touchTargets(page, '05 worlds 390')
    await page.getByRole('radio', { name: 'My Class' }).click()
    await page.getByRole('article', { name: 'Bridge Team' }).waitFor()
    await shot(page, `05-class-${name}`)
    await context.close()
  }

  // ---- Board 13: teacher roster -------------------------------------------------------------------------
  for (const [name, viewport, mobile] of [['1366', desktop, false], ['390', phone, true]]) {
    const { context, page } = await open(browser, { viewport, mobile, auth: teacher, api: { worlds, classes: [studio5], students: roster }, url: '/build?classroom=class' })
    await page.getByRole('list', { name: 'Students in this class' }).waitFor()
    await shot(page, `13-roster-${name}`)
    await page.getByRole('button', { name: 'Manage Alex R.' }).click()
    await page.getByRole('button', { name: 'Generate temporary password' }).click()
    await shot(page, `13-roster-manage-${name}`)
    if (mobile) await touchTargets(page, '13 manage 390')
    if (!mobile) {
      await page.getByRole('button', { name: 'Suspend access' }).click()
      await page.getByRole('button', { name: 'Suspend now' }).waitFor()
      await page.keyboard.press('Escape')
      await page.waitForTimeout(200)
      record('13 Escape closes only the confirmation', (await page.locator('[role="dialog"][aria-modal="true"]').count()) === 1 && await page.getByRole('button', { name: 'Suspend access' }).isVisible())
    }
    await context.close()
  }

  // ---- Board 14: class access and world controls --------------------------------------------------------
  for (const [name, viewport, mobile] of [['1366', desktop, false], ['390', phone, true]]) {
    const { context, page } = await open(browser, { viewport, mobile, auth: teacher, api: { worlds, classes: [studio5], students: roster, members, checkpoints }, url: '/build?classroom=class' })
    await page.getByRole('radio', { name: 'Class settings' }).click()
    await page.getByText('NEW-123').waitFor()
    await shot(page, `14-access-settings-${name}`)
    if (mobile) await touchTargets(page, '14 settings 390')
    await page.getByRole('radio', { name: 'Shared worlds' }).click()
    const card = page.getByRole('article', { name: 'Bridge Team' })
    await card.getByRole('button', { name: 'World controls' }).click()
    await page.getByRole('list', { name: 'Group members' }).waitFor()
    await shot(page, `14-access-world-controls-${name}`)
    if (mobile) await touchTargets(page, '14 world controls 390')
    if (!mobile) {
      await page.getByRole('button', { name: 'Restore selected checkpoint' }).click()
      await page.getByRole('button', { name: 'Restore now' }).waitFor()
      await shot(page, '14-access-restore-confirm-1366', '[role="dialog"]')
    }
    await context.close()
  }

  // ---- Board 15: account-owned safe states --------------------------------------------------------------
  {
    let { context, page } = await open(browser, { viewport: desktop, auth: student, api: { abort: true }, url: '/build?classroom=worlds' })
    await page.getByRole('alert').waitFor()
    await shot(page, '15-safe-network-error-1366')
    await context.close()
    ;({ context, page } = await open(browser, { viewport: desktop, auth: student, api: { status: 401, error: 'Your session expired. Sign in again.' }, url: '/build?classroom=worlds' }))
    await page.getByRole('radio', { name: 'Student' }).waitFor()
    // A lost session lands on returning-student sign-in (the person has an account), with the server's reason shown.
    record('15 expired session returns to student sign-in with the reason', (await page.getByLabel('Class sign-in code', { exact: true }).count()) === 1 && await page.getByRole('alert').isVisible())
    await shot(page, '15-safe-expired-session-1366')
    await context.close()
  }
} finally {
  await browser.close()
}
await writeFile(path.join(out, 'results.json'), JSON.stringify({ capturedAt: new Date().toISOString(), origin, results }, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
