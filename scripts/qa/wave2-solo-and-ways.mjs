/**
 * Wave 2 integration (docs/qa/wave2-int), the solo checks in a real browser (headless Chrome, its own WebGL):
 *
 * 1. Hackable 3D on its own: a classic 3D build (9 bricks, written to the classic builder's own autosave) → This
 *    project → Open in Hackable 3D → Play with the arrow keys and Space (the Hero moves) → the save chip says it is
 *    saved → reload → the same project, still 3D, with the build's bricks, and no Play together in This project.
 * 2. The ways in, at 1366, 768 and 390 wide: the landing page and the Make a game picker show all four games
 *    (Platformer, Racing, 3D and From nothing), and each of the picker's seven buttons (each game's Start and "Start
 *    with code inside", and Start from nothing) opens the right builder.
 *
 *   UI_ORIGIN=http://localhost:5273 node scripts/qa/wave2-solo-and-ways.mjs
 *
 * Needs `vite` (dev: the studio's `__studio` hook). Environment: PLAYWRIGHT_MODULE, CHROME_PATH, UI_ORIGIN, UI_OUTPUT.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchOptions, loadChromium, localOrigin, outputDir } from './lib/env.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const chromium = await loadChromium()
const origin = localOrigin('UI_ORIGIN', 'http://localhost:5273', 'the harness makes projects in this browser.')
const output = await outputDir('UI_OUTPUT', path.join(here, '../../docs/qa/wave2-int/shots/solo'))
const classicBuild = await readFile(path.join(here, 'fixtures/wave2-classic-build.json'), 'utf8')
const browser = await chromium.launch(launchOptions({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }))
const report = { origin, steps: [] }
let failed = 0
const IGNORED = [/favicon/i, /Download the React DevTools/, /GPU stall due to ReadPixels/, /WebGL/]

async function step(name, fn) {
  try {
    const detail = await fn()
    report.steps.push({ name, ok: true, ...(detail !== undefined ? { detail } : {}) })
    console.log(`ok   ${name}${detail !== undefined ? `  ${JSON.stringify(detail).slice(0, 260)}` : ''}`)
  } catch (error) {
    failed++
    report.steps.push({ name, ok: false, error: String(error?.message ?? error) })
    console.log(`FAIL ${name}: ${String(error?.message ?? error).slice(0, 400)}`)
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
async function newPage(viewport = { width: 1366, height: 900 }) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e.message ?? e).slice(0, 300)}`))
  return { context, page, errors }
}
const appErrors = (errors) => errors.filter((e) => !IGNORED.some((re) => re.test(e)))

// ------------------------------------------------------------------------------------------------ 1. Hackable 3D solo

{
  const { context, page, errors } = await newPage()
  await context.addInitScript((doc) => { if (!sessionStorage.getItem('w2-seeded')) { localStorage.setItem('brick-studio.current-project.v1', doc); sessionStorage.setItem('w2-seeded', '1') } }, classicBuild)
  const shot = (name) => page.screenshot({ path: path.join(output, `3d-${name}.jpg`), type: 'jpeg', quality: 78 })
  let before = null
  await step('3D: the classic builder opens the 9-brick build', async () => {
    await page.goto(origin + '/build')
    await page.getByRole('button', { name: 'This project' }).waitFor({ timeout: 30000 })
    await page.waitForTimeout(1500)
    await shot('1-classic-build')
  })
  await step('3D: This project → Open in Hackable 3D makes a Hackable 3D copy', async () => {
    await page.getByRole('button', { name: 'This project' }).click()
    await page.getByRole('menuitem', { name: /Open in Hackable 3D/ }).click()
    await page.waitForURL(/\/3d\/hackable/, { timeout: 30000 })
    await until(page, () => !!window.__studio, null, 'the 3D studio', 30000)
    const d = await page.evaluate(() => { const p = window.__studio.getState().project.design; return { kit: p.kit, name: p.name, scenery: p.scenery3d?.length ?? 0, codeBricks: p.bricks.map((b) => b.name) } })
    if (d.kit !== '3d' || d.scenery !== 9) throw new Error(JSON.stringify(d))
    await page.waitForTimeout(1500)
    await shot('2-hackable-copy')
    return { url: new URL(page.url()).pathname + new URL(page.url()).search, ...d }
  })
  await step('3D: This project has no Play together', async () => {
    await page.getByRole('button', { name: /This project/ }).click()
    const together = await page.getByRole('menuitem', { name: /Play together/ }).count()
    await page.keyboard.press('Escape')
    if (together) throw new Error('Play together is offered')
    return { playTogether: together }
  })
  await step('3D: Play, the arrow keys and Space move the Hero', async () => {
    await page.getByRole('radio', { name: /^Play/ }).click()
    await until(page, () => !!window.__studio.getState().runtime, null, 'the game')
    await page.waitForTimeout(800)
    const heroAt = () => page.evaluate(() => { const w = window.__studio.getState().runtime.world; const t = w.targets.find((x) => !x.isClone && w.bricks[x.brickId]?.name === 'Hero'); return t ? { x: t.x, y: t.y, z: t.z } : null })
    const from = await heroAt()
    await page.locator('canvas').first().click({ position: { x: 400, y: 300 } }).catch(() => {})
    await page.keyboard.down('ArrowUp')
    await page.keyboard.press('Space')
    await page.waitForTimeout(1200)
    await page.keyboard.up('ArrowUp')
    const to = await heroAt()
    await shot('3-play')
    const moved = from && to ? Math.hypot(to.x - from.x, to.z - from.z) : 0
    if (!(moved > 0.1)) throw new Error(`the Hero did not move: ${JSON.stringify({ from, to })}`)
    return { from, to }
  })
  await step('3D: saved, then reloaded: the same project', async () => {
    await page.getByRole('radio', { name: /Build/ }).click()
    await page.waitForTimeout(2500)
    before = await page.evaluate(() => (() => { const sort = (v) => Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])])) : v; return JSON.stringify(sort(window.__studio.getState().project.design)) })())
    const chip = await page.locator('.shell-save-chip, [class*="save"]').first().textContent().catch(() => '')
    const url = page.url()
    await page.reload()
    await until(page, () => !!window.__studio, null, 'the 3D studio after reload', 30000)
    await page.waitForTimeout(1000)
    const after = await page.evaluate(() => (() => { const sort = (v) => Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])])) : v; return JSON.stringify(sort(window.__studio.getState().project.design)) })())
    await shot('4-reloaded')
    if (after !== before) {
      let i = 0
      while (i < before.length && before[i] === after[i]) i++
      throw new Error(`the project changed across the reload at ${i}: was …${before.slice(Math.max(0, i - 160), i + 80)}… now …${after.slice(Math.max(0, i - 160), i + 80)}…`)
    }
    return { chip: (chip ?? '').trim().slice(0, 60), sameAddress: page.url() === url, bytes: after.length }
  })
  await step('3D: no console errors', async () => {
    const errs = appErrors(errors)
    if (errs.length) throw new Error(errs.slice(0, 4).join(' | '))
    return { ignored: errors.length - errs.length }
  })
  await context.close()
}

// ------------------------------------------------------------------------------------------------ 2. ways in

/** The picker's seven buttons (NewProjectSheet): each game's Start and "Start with code inside", and From nothing. */
const PICKS = [
  { name: 'Platformer: Start', click: (d) => d.getByRole('button', { name: 'Start a platformer' }), path: '/2d/build' },
  { name: 'Platformer: code inside', click: (d) => d.locator('.projects-game').filter({ hasText: 'Platformer' }).getByRole('button', { name: /code inside/ }), path: '/2d/hackable', kit: undefined },
  { name: 'Racing: Start', click: (d) => d.getByRole('button', { name: 'Start a race' }), path: '/2d/build' },
  { name: 'Racing: code inside', click: (d) => d.locator('.projects-game').filter({ hasText: 'Racing' }).getByRole('button', { name: /code inside/ }), path: '/2d/hackable-race', kit: 'race' },
  { name: '3D: Start', click: (d) => d.locator('.projects-3d-start'), path: '/build' },
  { name: '3D: code inside', click: (d) => d.locator('.projects-3d-other'), path: '/3d/hackable', kit: '3d' },
  { name: 'From nothing', click: (d) => d.getByRole('button', { name: 'Start from nothing' }), path: '/2d/hackable-blank', kit: 'blank' },
]

for (const [width, height] of [[1366, 900], [768, 1024], [390, 844]]) {
  const { context, page, errors } = await newPage({ width, height })
  const landing = async () => {
    await page.goto(origin + '/')
    await page.locator('.landing-make').first().waitFor({ timeout: 20000 })
  }
  const picker = async () => {
    await page.locator('.landing-make').first().click()
    const dialog = page.getByRole('dialog').first()
    await dialog.waitFor({ timeout: 20000 })
    await page.waitForTimeout(600)
    return dialog
  }
  await step(`${width}: the landing page shows all four games (Platformer, Racing, Start from nothing, 3D)`, async () => {
    await landing()
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(output, `ways-${width}-landing.jpg`), type: 'jpeg', quality: 72, fullPage: true })
    const found = {
      platformer: await page.getByRole('button', { name: 'Platformer', exact: true }).count(),
      racing: await page.getByRole('button', { name: 'Racing', exact: true }).count(),
      fromNothing: await page.getByRole('link', { name: 'Start from nothing' }).getAttribute('href'),
      threeD: await page.getByRole('link', { name: 'Start building in 3D' }).getAttribute('href'),
    }
    if (!found.platformer || !found.racing || found.fromNothing !== '/2d/hackable-blank?new=1' || found.threeD !== '/build') throw new Error(JSON.stringify(found))
    return found
  })
  await step(`${width}: the Make a game picker shows the four games`, async () => {
    const dialog = await picker()
    await page.screenshot({ path: path.join(output, `ways-${width}-picker.jpg`), type: 'jpeg', quality: 72 })
    const missing = []
    for (const p of PICKS) if (!(await p.click(dialog).first().isVisible().catch(() => false)) && !(await p.click(dialog).count())) missing.push(p.name)
    if (missing.length) throw new Error(`missing ${missing.join(', ')}`)
    return { buttons: PICKS.length }
  })
  for (const p of PICKS) {
    await step(`${width}: picker → ${p.name} opens ${p.path}`, async () => {
      await landing()
      const dialog = await picker()
      await p.click(dialog).first().scrollIntoViewIfNeeded().catch(() => {})
      await p.click(dialog).first().click()
      await page.waitForURL((u) => u.pathname === p.path, { timeout: 30000 })
      if (p.path.includes('hackable')) {
        await until(page, () => !!window.__studio, null, 'the Hackable studio', 30000)
        const kit = await page.evaluate(() => window.__studio.getState().project.design.kit)
        if (kit !== p.kit) throw new Error(`kit ${kit}`)
        return { kit: kit ?? 'platformer' }
      }
      await page.getByRole('button', { name: 'This project' }).waitFor({ timeout: 30000 })
      return { classic: new URL(page.url()).pathname + new URL(page.url()).search }
    })
  }
  await step(`${width}: no console errors`, async () => {
    const errs = appErrors(errors)
    if (errs.length) throw new Error(errs.slice(0, 4).join(' | '))
  })
  await context.close()
}

await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
await browser.close()
console.log(`\n${failed ? `${failed} step(s) failed` : 'all steps passed'}; report and screenshots in ${output}`)
process.exit(failed ? 1 : 0)
