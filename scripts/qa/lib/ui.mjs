/**
 * Shared page helpers for the brand QA scripts: role/label locators from scripts/qa/locators.json,
 * a small declarative step runner, and the guest-storage seeding every surface needs.
 *
 * A locator entry is `{ role, name, exact? }`, `{ label }`, `{ text }` or `{ css }`; `name` may be a string (exact by default)
 * or `{ regex }`. `css` is for controls whose accessible name is not stable (the save chip). Scripts pass the parsed JSON so a renamed control only needs a JSON edit.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export const ONBOARDING_KEY = 'brick-studio:onboarding:v1'
export const PROJECT_KEY = 'brick-studio.current-project.v1'
export const FIXTURE_DOCUMENT_PATH = path.join(here, '../../perf/fixtures/mixed-250.brickstudio.json')
export const CORRUPT_FIXTURE_PATH = path.join(here, '../fixtures/corrupt.brickstudio.json')
export const EXPANDED_FIXTURE_PATH = path.join(here, '../fixtures/expanded-128.brickstudio.json')

export async function loadLocators() {
  return JSON.parse(await readFile(path.join(here, '../locators.json'), 'utf8'))
}

export function makeLocate(locators) {
  return function locate(page, key) {
    const spec = locators[key]
    if (!spec) throw new Error(`locators.json has no entry "${key}"`)
    const name = spec.name && typeof spec.name === 'object' ? new RegExp(spec.name.regex) : spec.name
    if (spec.role) return page.getByRole(spec.role, { name, ...(typeof name === 'string' ? { exact: spec.exact ?? true } : {}) })
    if (spec.label) return page.getByLabel(spec.label, { exact: true })
    if (spec.text) return page.getByText(spec.text, { exact: true })
    if (spec.css) return page.locator(spec.css)
    throw new Error(`locators.json entry "${key}" needs role, label, text or css`)
  }
}

/**
 * Steps: `{ click }`, `{ clickIfVisible }`, `{ waitFor }`, `{ waitHidden }`, `{ waitCanvasIn }`, `{ press }`,
 * `{ wait: ms }`, `{ fill: { locator, value } }`, `{ setInputFiles: { locator, file } }`,
 * `{ scrollToHeading: [regex, ...] }` (first heading that matches; records `notes` when none does),
 * `{ loseContext: true }` (real WEBGL_lose_context on the largest canvas).
 */
export async function runSteps(page, locate, steps = [], notes = []) {
  for (const step of steps) {
    if (step.click) await locate(page, step.click).first().click()
    else if (step.clickIfVisible) {
      const target = locate(page, step.clickIfVisible).first()
      if (await target.isVisible().catch(() => false)) await target.click()
    } else if (step.waitFor) await locate(page, step.waitFor).first().waitFor({ state: 'visible' })
    else if (step.waitHidden) await locate(page, step.waitHidden).first().waitFor({ state: 'hidden' })
    else if (step.waitCanvasIn) await locate(page, step.waitCanvasIn).first().locator('canvas').first().waitFor({ state: 'attached', timeout: 15000 })
    else if (step.press) await page.keyboard.press(step.press)
    else if (step.wait) await page.waitForTimeout(step.wait)
    else if (step.fill) await locate(page, step.fill.locator).first().fill(step.fill.value)
    else if (step.setInputFiles) await locate(page, step.setInputFiles.locator).first().setInputFiles(step.setInputFiles.file)
    else if (step.scrollToHeading) {
      let found = false
      for (const pattern of step.scrollToHeading) {
        const heading = page.getByRole('heading', { name: new RegExp(pattern, 'i') }).first()
        if (await heading.isVisible().catch(() => false)) {
          await heading.scrollIntoViewIfNeeded()
          await page.evaluate(() => window.scrollBy(0, -24))
          found = true
          break
        }
      }
      if (!found) notes.push(`no heading matched ${step.scrollToHeading.join(' | ')}; captured the top of the page`)
    } else if (step.loseContext) {
      const lost = await page.evaluate(() => {
        const canvases = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)
        for (const canvas of canvases) {
          const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
          const extension = gl?.getExtension('WEBGL_lose_context')
          if (extension) { extension.loseContext(); return true }
        }
        return false
      })
      if (!lost) throw new Error('No WebGL canvas exposed WEBGL_lose_context')
    } else throw new Error(`Unknown step ${JSON.stringify(step)}`)
  }
}

/**
 * Seeds guest browser storage before the first script runs: dismisses the onboarding guide unless `quickStart`,
 * stores `seed` (a document JSON string) as the current guest project, and copies any extra `storage` entries
 * into localStorage and `session` entries into sessionStorage (the classroom session key
 * `brick-studio.classroom-session.v1` lives there) verbatim.
 */
export async function seedContext(context, { quickStart = false, seed = null, storage = {}, session = {} } = {}) {
  await context.addInitScript(({ onboardingKey, projectKey, quickStart, seed, storage, session }) => {
    const put = (store, entries) => {
      for (const [key, value] of Object.entries(entries)) store.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
    }
    try {
      if (!quickStart) localStorage.setItem(onboardingKey, 'dismissed')
      if (seed) localStorage.setItem(projectKey, seed)
      put(localStorage, storage)
      put(sessionStorage, session)
    } catch { /* blocked storage is its own scenario */ }
  }, { onboardingKey: ONBOARDING_KEY, projectKey: PROJECT_KEY, quickStart, seed, storage, session })
}

/** Opens the studio menu and triggers Export, returning the downloaded document as parsed JSON. */
export async function exportDocument(page, locate) {
  await locate(page, 'worldMenu').first().click()
  await locate(page, 'menuExport').first().waitFor({ state: 'visible' })
  const downloaded = page.waitForEvent('download', { timeout: 15000 })
  await locate(page, 'menuExport').first().click()
  const download = await downloaded
  const file = await download.path()
  const text = await readFile(file, 'utf8')
  return { name: download.suggestedFilename(), document: JSON.parse(text), text }
}

export async function importDocument(page, locate, file) {
  await locate(page, 'importFile').first().setInputFiles(file)
}
