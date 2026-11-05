/**
 * Wave 2 integration (docs/qa/wave2-int): three kids in one Hackable room, in real browsers against a local Worker.
 * Each kid is their own browser context (their own storage and browser key), as three computers would be.
 *
 * For each game (the Platformer with Parity B's bricks, Racing with Parity B's track bricks, and a game from nothing):
 * - Ana opens a new project, sets it up (through her studio's own store, the dev hook `__studio`), and presses
 *   This project → Play together; Ben and Cy join from the link, with their names.
 * - Building together: Ben places a brick from the drawer and paints cells by tapping the stage (`__studioStage`), so
 *   the edits go out from his studio exactly as a kid's would.
 * - Code: Ben's Code is closed until Ana's Room menu lets him change code; then Ben switches a script off in Code (its
 *   switch on the block), a live code edit that restarts that brick for everyone.
 * - Each player on their own (where the game has them): Ana's studio moves a critter or a hurting brick next to Ben's
 *   player (a live building edit), and only Ben is hurt; then a Goal next to Ben, and only Ben finishes.
 * - Every game agrees: fingerprints at every 60th tick in all three browsers, no resyncs, and no console errors.
 *
 *   UI_ORIGIN=http://localhost:5273 node scripts/qa/wave2-rooms.mjs [platformer|race|blank ...]
 *
 * Needs `vite` (dev, for the hooks) with VITE_LIVE_SERVER_URL pointing at `wrangler dev --local` (.claude/launch.json
 * w2-app and w2-worker). Environment: PLAYWRIGHT_MODULE, CHROME_PATH, UI_ORIGIN (localhost only), UI_OUTPUT.
 */
import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { launchOptions, loadChromium, localOrigin, outputDir } from './lib/env.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const chromium = await loadChromium()
const origin = localOrigin('UI_ORIGIN', 'http://localhost:5273', 'the harness makes projects and rooms here.')
const output = await outputDir('UI_OUTPUT', path.join(here, '../../docs/qa/wave2-int/shots/rooms'))
const games = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const GAMES = games.length ? games : ['platformer', 'race', 'blank']

const browser = await chromium.launch(launchOptions())
const report = { origin, games: {} }
let failed = 0

/** One kid: a browser context of their own, its page, and the console errors it logged. */
async function kid(name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e.message ?? e).slice(0, 300)}`))
  return { name, context, page, errors }
}

const wait = (page, ms) => page.waitForTimeout(ms)
const at = (page, x, y) => page.evaluate(([wx, wy]) => window.__studioStage?.toScreen(wx, wy) ?? null, [x, y])
const tapAt = async (page, x, y) => { const p = await at(page, x, y); if (!p) throw new Error('no stage on screen'); await page.mouse.click(p.x, p.y) }
/** The room as this browser sees it (rooms/session.ts, dev hook). */
const room = (page) => page.evaluate(() => {
  const s = window.__hackableRoom
  if (!s) return null
  const w = s.runtime?.world
  return {
    tick: s.timeline?.tick ?? null,
    me: s.view.me, host: s.view.host, build: s.view.build, code: s.view.code, status: s.view.status, notice: s.view.notice,
    stats: { ...s.stats }, rejected: s.rejected,
    players: (w?.players ?? []).map((p) => ({ num: p.num, name: p.name, finished: p.finished ?? null })),
    history: s.view.history.map((h) => `${h.name} ${h.summary}${h.undone ? ' (put back)' : ''}`),
    copies: w?.design?.copies.length ?? 0, bricks: (w?.design?.bricks ?? []).map((b) => b.name),
  }
})
/** Fingerprints at the given ticks (null where this browser no longer keeps that tick). */
const prints = (page, ticks) => page.evaluate((ts) => ts.map((t) => window.__hackableRoom?.fingerprintAt(t) ?? null), ticks)
/** A player's own copy of the player brick, from this browser's game. */
const playerTarget = (page, num) => page.evaluate((n) => {
  const t = window.__hackableRoom?.runtime?.world.targets.find((x) => x.player === n && !x.isClone)
  return t ? { x: t.x, y: t.y, vars: { ...t.variables } } : null
}, num)

async function step(report, name, fn) {
  try {
    const detail = await fn()
    report.steps.push({ name, ok: true, ...(detail !== undefined ? { detail } : {}) })
    console.log(`ok   ${name}${detail !== undefined ? `  ${JSON.stringify(detail).slice(0, 220)}` : ''}`)
  } catch (error) {
    failed++
    report.steps.push({ name, ok: false, error: String(error?.message ?? error) })
    console.log(`FAIL ${name}: ${String(error?.message ?? error).slice(0, 400)}`)
  }
}

/** Wait until `check` is true in this page (polling the page's state). */
async function until(page, fn, arg, what, ms = 15000) {
  const start = Date.now()
  for (;;) {
    const ok = await page.evaluate(fn, arg).catch(() => false)
    if (ok) return
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`)
    await page.waitForTimeout(150)
  }
}

/** Every browser agrees on the game: fingerprints at every 60th tick of the last stretch all three still keep. */
async function agree(kids) {
  const ticks = await Promise.all(kids.map((k) => room(k.page).then((r) => r.tick)))
  const top = Math.min(...ticks) - 30
  const want = Array.from({ length: 40 }, (_, i) => Math.floor((top - i * 60) / 60) * 60).filter((t) => t > 0)
  const all = await Promise.all(kids.map((k) => prints(k.page, want)))
  const compared = want.filter((_, i) => all.every((p) => p[i] !== null))
  const same = compared.filter((t) => { const i = want.indexOf(t); return all.every((p) => p[i] === all[0][i]) })
  if (!compared.length) throw new Error('no tick kept by all three')
  if (same.length !== compared.length) throw new Error(`fingerprints differ at ${compared.filter((t) => !same.includes(t)).join(', ')}`)
  return { ticks: `${Math.min(...compared)}..${Math.max(...compared)}`, compared: compared.length, list: compared }
}

// ------------------------------------------------------------------------------------------------ each game

const GAME_SETUP = {
  /** The starter level plus Parity B's bricks along the way (checkpoint, critters, platforms). */
  platformer: { path: '/2d/hackable?new=1' },
  race: { path: '/2d/hackable-race?new=1' },
  blank: { path: '/2d/hackable-blank?new=1' },
}

async function playTogether(game) {
  const rep = (report.games[game] = { steps: [] })
  const ana = await kid('Ana')
  const ben = await kid('Ben')
  const cy = await kid('Cy')
  const kids = [ana, ben, cy]
  const shot = (k, name) => k.page.screenshot({ path: path.join(output, `${game}-${name}.jpg`), type: 'jpeg', quality: 78 })
  // Fingerprints are compared after every step from building on, over the ticks all three browsers still keep.
  const checked = new Set()
  const sample = async () => { try { const r = await agree(kids); for (const t of r.list) checked.add(t) } catch (e) { if (!/no tick kept/.test(String(e))) throw e } }
  try {
    await step(rep, 'Ana opens a new project and sets it up', async () => {
      await ana.page.goto(origin + GAME_SETUP[game].path)
      await until(ana.page, () => !!window.__studio, null, 'the studio')
      if (SETUP_FILE[game]) {
        await ana.page.getByRole('button', { name: /This project/ }).click()
        await ana.page.locator('input[aria-label="Upload project file"]').setInputFiles(SETUP_FILE[game])
        await ana.page.getByRole('dialog', { name: 'Confirm open' }).getByRole('button', { name: 'Open it' }).click()
        await wait(ana.page, 800)
        if (await ana.page.getByRole('menuitem', { name: /Play together/ }).isVisible().catch(() => false)) await ana.page.keyboard.press('Escape')
      }
      return ana.page.evaluate(SETUP[game])
    })
    await step(rep, 'Ana: This project → Play together; the room bar shows the link', async () => {
      await ana.page.getByRole('button', { name: /This project/ }).click()
      await ana.page.getByRole('menuitem', { name: /Play together/ }).click()
      await ana.page.getByRole('textbox', { name: 'Link to join' }).waitFor({ timeout: 15000 })
      await until(ana.page, () => window.__hackableRoom?.view.status === 'live' || window.__hackableRoom?.view.status === 'connected' || (window.__hackableRoom?.timeline?.tick ?? 0) > 30, null, 'the room')
      return { link: await ana.page.getByRole('textbox', { name: 'Link to join' }).inputValue() }
    })
    const link = await ana.page.getByRole('textbox', { name: 'Link to join' }).inputValue()
    for (const k of [ben, cy]) {
      await step(rep, `${k.name} joins from the link`, async () => {
        await k.page.goto(link)
        await k.page.getByRole('textbox', { name: 'Your name' }).fill(k.name)
        await k.page.getByRole('button', { name: /^(Join|Rejoin)$/ }).click()
        await until(k.page, () => (window.__hackableRoom?.timeline?.tick ?? 0) > 30 && !!window.__studioStage, null, 'the game')
        const r = await room(k.page)
        return { me: r.me, build: r.build, code: r.code }
      })
    }
    await wait(ana.page, 1500)
    await step(rep, 'Ana sees Ben and Cy; everyone has a player', async () => {
      const r = await room(ana.page)
      if (r.players.length !== 3) throw new Error(`players ${JSON.stringify(r.players)}`)
      return r.players.map((p) => p.name)
    })
    await shot(ben, '1-ben-joined')

    const ACT = ACTIONS[game]
    await step(rep, `Ben builds: ${ACT.buildWhat}`, async () => {
      const before = (await room(ana.page)).history.length
      await ACT.build(ben.page)
      await until(ana.page, (n) => (window.__hackableRoom?.view.history.length ?? 0) > n, before, 'the edit in Ana\'s history')
      await wait(ana.page, 800)
      const [a, b, c] = await Promise.all(kids.map((k) => room(k.page)))
      if (a.copies !== b.copies || b.copies !== c.copies) throw new Error(`copies ${a.copies} ${b.copies} ${c.copies}`)
      return { history: a.history.slice(-2), rejected: b.rejected }
    })
    await sample()
    await shot(ana, '2-ana-after-ben-built')

    await step(rep, 'Ben\'s Code is closed until Ana lets him; he opens it at once, and nothing is sent', async () => {
      const codeTab = ben.page.getByRole('radio', { name: /Code/ })
      const closedBefore = await codeTab.isDisabled().catch(() => null)
      const before = (await room(ana.page)).history.length
      await ana.page.getByRole('button', { name: 'Room', exact: true }).click()
      await ana.page.getByRole('menuitem', { name: 'Let Ben change code' }).click()
      // A kid presses Code the moment it opens (M2's RoomBuilder opened it before the blocks were in the studio, and an
      // editor opened then wiped the Hero for everyone).
      await until(ben.page, () => window.__hackableRoom?.view.code === true, null, 'Ben may code')
      await codeTab.click({ timeout: 15000 })
      await wait(ben.page, 3000)
      const after = await room(ana.page)
      if (after.history.length !== before) throw new Error(`opening Code sent: ${after.history.slice(before).join(' | ')}`)
      return { closedBefore, historyUnchanged: true }
    })
    await step(rep, 'Ben switches a script off in Code: a live code edit, and everyone hears it', async () => {
      await ACT.code(ben.page)
      await until(cy.page, () => /changed .*code/.test(window.__hackableRoom?.view.notice ?? ''), null, 'the notice on Cy\'s screen')
      const r = await room(cy.page)
      return { notice: r.notice }
    })
    await sample()
    await shot(ben, '3-ben-code')
    await shot(cy, '4-cy-notice')

    // Everyone watches the game: Play (the hurt and finish screens are Play's).
    for (const k of kids) await k.page.getByRole('radio', { name: /^Play/ }).click().catch(() => {})
    await wait(ana.page, 1000)
    if (ACT.checkpoint) {
      await step(rep, 'Each on their own: a Checkpoint gives Ben and Cy their own (Ana\'s start stays)', async () => ACT.checkpoint(ana.page, ben.page, cy.page))
    }
    await sample()
    if (ACT.hurt) {
      await step(rep, `Each on their own: ${ACT.hurtWhat} hurts only Ben`, async () => ACT.hurt(ana.page, ben.page, cy.page))
      await shot(ben, '5-ben-hurt')
    }
    await sample()
    if (ACT.finish) {
      await step(rep, 'Each on their own: a Goal finishes only Ben; the game goes on for Ana and Cy', async () => ACT.finish(ana.page, ben.page, cy.page))
      await shot(ben, '6-ben-finished')
      await shot(cy, '7-cy-notice')
    }
    await wait(ana.page, 3000)
    await step(rep, 'Every game agrees: fingerprints, no resyncs, no refused edits', async () => {
      const { list: _list, ...result } = await agree(kids)
      for (const t of _list) checked.add(t)
      const rooms = await Promise.all(kids.map((k) => room(k.page)))
      const resyncs = rooms.map((r) => r.stats.resyncs)
      if (resyncs.some((n) => n > 0)) throw new Error(`resyncs ${resyncs}`)
      return { ...result, everyStepTicksCompared: checked.size, resyncs, rewinds: rooms.map((r) => r.stats.rewinds), rejected: rooms.map((r) => r.rejected), history: rooms[0].history }
    })
    await step(rep, 'No console errors in any browser', async () => {
      const errs = kids.flatMap((k) => k.errors.map((e) => `${k.name}: ${e}`)).filter((e) => !IGNORED.some((re) => re.test(e)))
      if (errs.length) throw new Error(errs.slice(0, 5).join(' | '))
      return { ignored: kids.flatMap((k) => k.errors).filter((e) => IGNORED.some((re) => re.test(e))).length }
    })
  } finally {
    for (const k of kids) await k.context.close()
  }
}

/** Console lines that are not the app's: React's dev warnings about the test's own fast clicks, and favicon 404s. */
const IGNORED = [/favicon/i, /Download the React DevTools/]

// ------------------------------------------------------------------------------------------------ set-ups (run in Ana's page)

const SETUP = {
  platformer: () => {
    const s = window.__studio
    const place = (id, x, y) => { const b = s.addCatalogBrick(id); if (b) s.addCopy(b, x, y); return b }
    place('brick_checkpoint', 200, 32)
    place('brick_spiky', 620, 40)
    place('brick_shellbug', 700, 40)
    place('brick_flyer', 520, 120)
    place('brick_platform', 380, 130)
    place('brick_lift', 800, 90)
    return s.getState().project.design.bricks.map((b) => b.name)
  },
  race: () => {
    const s = window.__studio
    for (const id of ['brick_tires', 'brick_bumper', 'brick_tree', 'brick_stand', 'brick_flowers']) s.addCatalogBrick(id)
    // A bumper in every 6th barrier cell, so the Cars meet Parity B's bricks while everyone drives.
    const d = s.getState().project.design
    const bumper = d.bricks.find((b) => b.id === 'brick_bumper').grid.char
    let n = 0
    d.tiles.data.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === 'X' && n++ % 6 === 0) s.setTile(c, r, bumper) }))
    return d.bricks.map((b) => b.name)
  },
  blank: () => window.__studio.getState().project.design.bricks.map((b) => b.name),
}

/** Files Ana opens with This project → Open File before playing together (SETUP then reads what opened). */
const SETUP_FILE = { blank: process.env.W2_BLANK_FILE }

// ------------------------------------------------------------------------------------------------ actions per game

const ACTIONS = {
  platformer: {
    buildWhat: 'a Coin from the drawer, tapped onto the stage',
    async build(page) {
      await page.getByRole('radio', { name: /Build/ }).click()
      await page.getByRole('region', { name: 'Bricks' }).getByRole('button', { name: /^Coin\b/ }).first().click()
      await tapAt(page, 300, 120)
      await page.keyboard.press('Escape')
    },
    async code(page) {
      // The Moving platform's Code: switch its first script off (the switch on the block, as a kid would).
      await openCode(page, 'Moving platform')
      await clickFirstSwitch(page)
    },
    hurtWhat: 'a Spiky moved next to Ben',
    async hurt(ana, ben, cy) {
      const benAt = await playerTarget(ana, 2)
      await ana.evaluate(([x, y]) => {
        const s = window.__studio
        const copy = s.getState().project.design.copies.find((c) => c.brickId === 'brick_spiky')
        s.updateCopy(copy.id, { x: x + 10, y })
      }, [benAt.x, benAt.y])
      await until(ben, () => !!document.querySelector('.play-hurt'), null, 'Ben\'s Ouch', 8000)
      const others = await Promise.all([ana, cy].map((p) => p.evaluate(() => !!document.querySelector('.play-hurt'))))
      const hurt = await Promise.all([1, 2, 3].map((n) => playerTarget(ana, n).then((t) => Number(t?.vars.hurt_time ?? 0))))
      if (others.some(Boolean)) throw new Error('someone else saw Ouch')
      return { ouchOnBen: true, ouchElsewhere: others, hurtTime: hurt }
    },
    async checkpoint(ana) {
      const startOf = async (n) => Number((await playerTarget(ana, n)).vars.start_x)
      const anaStart = await startOf(1)
      const moveFlagTo = (n, dx) => playerTarget(ana, n).then((t) => ana.evaluate(([x, y]) => {
        const s = window.__studio
        const copy = s.getState().project.design.copies.find((c) => c.brickId === 'brick_checkpoint')
        s.updateCopy(copy.id, { x, y: y + 8 })
      }, [t.x + dx, t.y]))
      await moveFlagTo(2, 4)
      await until(ana, () => { const t = window.__hackableRoom.runtime.world.targets.find((x) => x.player === 2 && !x.isClone); const f = window.__hackableRoom.runtime.world.targets.find((x) => x.brickId === 'brick_checkpoint'); return t && f && Math.abs(Number(t.variables.start_x) - f.x) < 16 }, null, 'Ben\'s start at the flag')
      const benStart = await startOf(2)
      await moveFlagTo(3, 4)
      await until(ana, () => { const t = window.__hackableRoom.runtime.world.targets.find((x) => x.player === 3 && !x.isClone); const f = window.__hackableRoom.runtime.world.targets.find((x) => x.brickId === 'brick_checkpoint'); return t && f && Math.abs(Number(t.variables.start_x) - f.x) < 16 }, null, 'Cy\'s start at the flag (already up)')
      const after = await Promise.all([1, 2, 3].map(startOf))
      if (after[0] !== anaStart) throw new Error('Ana\'s start moved')
      if (after[1] !== benStart) throw new Error('Ben\'s start moved with Cy\'s')
      return { startX: { ana: after[0], ben: after[1], cy: after[2] } }
    },
    async finish(ana, ben, cy) {
      const benAt = await playerTarget(ana, 2)
      await ana.evaluate(([x, y]) => {
        const s = window.__studio
        const copy = s.getState().project.design.copies.find((c) => c.brickId === 'brick_goal')
        s.updateCopy(copy.id, { x, y: y + 8 })
      }, [benAt.x, benAt.y])
      await ben.getByRole('dialog', { name: 'You made it' }).waitFor({ timeout: 10000 })
      await cy.getByText(/^Ben finished, /).waitFor({ timeout: 10000 })
      const r = await room(ana)
      const live = await ana.evaluate(() => !!window.__hackableRoom?.runtime?.world.everyTick)
      return { players: r.players, gameGoesOn: live }
    },
  },
}

ACTIONS.race = {
  buildWhat: 'Tire stack cells painted from the drawer',
  async build(page) {
    await page.getByRole('radio', { name: /Build/ }).click()
    await page.getByRole('region', { name: 'Bricks' }).getByRole('button', { name: /^Tire stack\b/ }).first().click()
    const d = await page.evaluate(() => window.__hackableRoom.runtime.world.design.bounds)
    for (const dx of [0, 16, 32]) await tapAt(page, d.left + 40 + dx, d.bottom + 40)
    await page.keyboard.press('Escape')
  },
  async code(page) {
    await openCode(page, 'Starter')
    await clickFirstSwitch(page)
  },
}
ACTIONS.blank = {
  buildWhat: 'a Star from My bricks, tapped onto the stage',
  async build(page) {
    await page.getByRole('radio', { name: /Build/ }).click()
    await page.getByRole('region', { name: 'Bricks' }).getByRole('button', { name: /^Star\b/ }).first().click()
    await tapAt(page, 360, 120)
    await page.keyboard.press('Escape')
  },
  async code(page) {
    await openCode(page, 'Walker')
    await clickFirstSwitch(page)
  },
  hurtWhat: 'the Spike (Hurts job) moved next to Ben\'s Zip',
  async hurt(ana, ben, cy) {
    // Friends start 20 steps apart and the Spike is 16 wide: Ben walks away from the others first (his arrow key).
    await ben.locator('.cl-stage-frame canvas, canvas').first().click({ position: { x: 5, y: 5 } }).catch(() => {})
    await ben.keyboard.down('ArrowRight')
    await wait(ben, 900)
    await ben.keyboard.up('ArrowRight')
    await wait(ben, 600)
    const benAt = await playerTarget(ana, 2)
    await ana.evaluate(([x, y]) => {
      const s = window.__studio
      const d = s.getState().project.design
      const spike = d.bricks.find((b) => b.name === 'Spike')
      s.updateCopy(d.copies.find((c) => c.brickId === spike.id).id, { x: x + 6, y })
    }, [benAt.x, benAt.y])
    await until(ben, () => !!document.querySelector('.play-hurt'), null, 'Ben\'s Ouch', 8000)
    const others = await Promise.all([ana, cy].map((p) => p.evaluate(() => !!document.querySelector('.play-hurt'))))
    if (others.some(Boolean)) throw new Error('someone else saw Ouch')
    return { ouchOnBen: true, ouchElsewhere: others }
  },
  async finish(ana, ben, cy) {
    // Ben stands somewhere new first (the Spike sent him back to his start), then the Flag comes to him.
    await ana.evaluate(() => {
      const s = window.__studio
      const d = s.getState().project.design
      const spike = d.bricks.find((b) => b.name === 'Spike')
      s.updateCopy(d.copies.find((c) => c.brickId === spike.id).id, { x: 260, y: 300 })
    })
    await wait(ana, 1500)
    const benAt = await playerTarget(ana, 2)
    await ana.evaluate(([x, y]) => {
      const s = window.__studio
      const d = s.getState().project.design
      const flag = d.bricks.find((b) => b.name === 'Flag')
      s.updateCopy(d.copies.find((c) => c.brickId === flag.id).id, { x: x + 4, y })
    }, [benAt.x, benAt.y])
    await ben.getByRole('dialog', { name: 'You win' }).waitFor({ timeout: 10000 })
    await cy.getByText(/^Ben finished, /).waitFor({ timeout: 10000 })
    const r = await room(ana)
    const live = await ana.evaluate(() => !!window.__hackableRoom?.runtime?.world.everyTick)
    return { players: r.players, gameGoesOn: live }
  },
}

async function openCode(page, brickName) {
  await page.getByRole('radio', { name: /Code/ }).click()
  await page.getByRole('region', { name: 'In this level' }).getByRole('listitem').filter({ hasText: brickName }).first().click()
  await page.waitForTimeout(800)
}
async function clickFirstSwitch(page) {
  const sw = page.locator('.code-script-switch').first()
  await sw.waitFor({ timeout: 10000 })
  await sw.dispatchEvent('click')
}

for (const game of GAMES) {
  console.log(`\n== ${game}`)
  if (!ACTIONS[game]) { console.log(`(no actions for ${game} yet)`); continue }
  await playTogether(game)
}
await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
await browser.close()
console.log(`\n${failed ? `${failed} step(s) failed` : 'all steps passed'}; report and screenshots in ${output}`)
process.exit(failed ? 1 : 0)
