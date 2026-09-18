/**
 * Document schema round trips through the real UI: import a schema-1, schema-2 and schema-3 (expanded plate)
 * file with the studio menu's file input, Export it back, reload, then Home → Continue building → reload, and
 * require the exported document to equal the expected document at every step.
 *
 * Environment:
 *   PLAYWRIGHT_MODULE, CHROME_PATH   browser (scripts/qa/lib/env.mjs)
 *   UI_ORIGIN                        Vite dev origin, localhost only (guest storage is replaced)
 *   UI_OUTPUT                        artifact directory (default /tmp/brick-schema-roundtrip)
 *   CASES=schema-2,schema-3          subset of case ids
 *
 * Expected documents: schema 2 and 3 files must come back byte-for-byte equal as JSON values (key order ignored);
 * the schema-1 file must come back normalized to schema 2 with `environmentId: "classic"` and `customParts: []`
 * (docs/LIVE_WORLD_PROTOCOL.md). The stored guest project is compared too and recorded as a note when its shape
 * differs from the export (the persistence envelope may wrap the document).
 */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { hostSnapshot, launchOptions, loadChromium, localOrigin, outputDir } from './lib/env.mjs'
import { EXPANDED_FIXTURE_PATH, FIXTURE_DOCUMENT_PATH, PROJECT_KEY, exportDocument, importDocument, loadLocators, makeLocate, seedContext } from './lib/ui.mjs'

const chromium = await loadChromium()
const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5198', 'the harness replaces guest browser storage.')
const output = await outputDir('UI_OUTPUT', '/tmp/brick-schema-roundtrip')
const locate = makeLocate(await loadLocators())
const legacyFixture = path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures/legacy-v1.brickstudio.json')

const schema2 = JSON.parse(await readFile(FIXTURE_DOCUMENT_PATH, 'utf8'))
const schema3 = JSON.parse(await readFile(EXPANDED_FIXTURE_PATH, 'utf8'))
const schema1 = JSON.parse(await readFile(legacyFixture, 'utf8'))
assert.equal(schema2.schemaVersion, 2)
assert.equal(schema3.schemaVersion, 3)
assert.equal(schema1.schemaVersion, 1)

const CASES = [
  { id: 'schema-2', file: FIXTURE_DOCUMENT_PATH, expected: schema2 },
  { id: 'schema-3', file: EXPANDED_FIXTURE_PATH, expected: schema3 },
  { id: 'schema-1-legacy', file: legacyFixture, expected: { ...schema1, schemaVersion: 2, environmentId: 'classic', customParts: [] } },
]
const caseIds = process.env.CASES ? process.env.CASES.split(',').map((s) => s.trim()).filter(Boolean) : CASES.map((c) => c.id)

const canonical = (value) => JSON.stringify(sortKeys(value))
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]))
  return value
}
function difference(actual, expected) {
  const a = sortKeys(actual), e = sortKeys(expected)
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(e ?? {})])
  return [...keys].filter((key) => JSON.stringify(a?.[key]) !== JSON.stringify(e?.[key])).map((key) => {
    if (key === 'bricks') {
      const count = `${a?.bricks?.length ?? 'none'} vs ${e?.bricks?.length ?? 'none'} bricks`
      const first = (a?.bricks ?? []).findIndex((brick, index) => JSON.stringify(brick) !== JSON.stringify(e?.bricks?.[index]))
      return `bricks: ${count}${first >= 0 ? `, first difference at index ${first}: ${JSON.stringify(a.bricks[first])} vs ${JSON.stringify(e?.bricks?.[first])}` : ''}`
    }
    return `${key}: ${JSON.stringify(a?.[key])} vs ${JSON.stringify(e?.[key])}`
  })
}

async function waitForStoredBricks(page, count) {
  await page.waitForFunction(({ key, count }) => {
    try {
      const stored = JSON.parse(localStorage.getItem(key) || 'null')
      const document = stored?.document ?? stored
      return Array.isArray(document?.bricks) && document.bricks.length === count
    } catch { return false }
  }, { key: PROJECT_KEY, count }, { timeout: 15000 })
}

async function runCase(browser, testCase) {
  const context = await browser.newContext({ acceptDownloads: true })
  await seedContext(context)
  const page = await context.newPage()
  const pageErrors = [], failures = [], notes = [], steps = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('dialog', (dialog) => dialog.type() === 'confirm' ? dialog.accept() : dialog.dismiss())
  const check = async (label, exported) => {
    const same = canonical(exported.document) === canonical(testCase.expected)
    steps.push({ step: label, status: same ? 'passed' : 'failed', filename: exported.name })
    if (!same) failures.push(`${label}: export differs — ${difference(exported.document, testCase.expected).join('; ')}`)
    if (!exported.name.endsWith('.brickstudio.json')) failures.push(`${label}: download name ${exported.name} does not end with .brickstudio.json`)
    await writeFile(path.join(output, `${testCase.id}-${label}.json`), exported.text)
  }
  try {
    await page.goto(`${origin}/build`, { waitUntil: 'domcontentloaded' })
    await locate(page, 'worldMenu').first().waitFor({ state: 'visible', timeout: 20000 })
    await importDocument(page, locate, testCase.file)
    await waitForStoredBricks(page, testCase.expected.bricks.length)
    await page.waitForTimeout(500)
    await check('after-import', await exportDocument(page, locate))
    const stored = await page.evaluate((key) => localStorage.getItem(key), PROJECT_KEY)
    const storedDocument = (() => { try { const parsed = JSON.parse(stored); return parsed?.document ?? parsed } catch { return null } })()
    if (canonical(storedDocument) !== canonical(testCase.expected)) notes.push(`stored guest project differs from the export: ${difference(storedDocument, testCase.expected).join('; ') || 'envelope only'}`)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await locate(page, 'worldMenu').first().waitFor({ state: 'visible', timeout: 20000 })
    await page.waitForTimeout(500)
    await check('after-reload', await exportDocument(page, locate))

    await locate(page, 'brandHome').first().click()
    await locate(page, 'continueBuilding').first().waitFor({ state: 'visible', timeout: 20000 })
    await page.screenshot({ path: path.join(output, `${testCase.id}-home.png`) })
    await locate(page, 'continueBuilding').first().click()
    await locate(page, 'worldMenu').first().waitFor({ state: 'visible', timeout: 20000 })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await locate(page, 'worldMenu').first().waitFor({ state: 'visible', timeout: 20000 })
    await page.waitForTimeout(500)
    await check('after-home-continue-reload', await exportDocument(page, locate))
    await page.screenshot({ path: path.join(output, `${testCase.id}-final.png`) })
    if (pageErrors.length) failures.push(`pageerror: ${pageErrors.join(' | ')}`)
  } catch (error) {
    failures.push(String(error).split('\n')[0])
    await page.screenshot({ path: path.join(output, `${testCase.id}-failure.png`) }).catch(() => {})
  } finally {
    await context.close()
  }
  return { id: testCase.id, file: path.relative(process.cwd(), testCase.file), status: failures.length ? 'failed' : 'passed', steps, failures, notes }
}

const browser = await chromium.launch(launchOptions())
const report = { checkedAt: new Date().toISOString(), origin, host: hostSnapshot(), cases: [] }
try {
  for (const testCase of CASES.filter((c) => caseIds.includes(c.id))) {
    const result = await runCase(browser, testCase)
    report.cases.push(result)
    console.log(`${result.status.padEnd(6)} ${result.id.padEnd(16)} ${result.steps.map((s) => `${s.step}=${s.status}`).join(' ')}${result.failures.length ? '  ' + result.failures.join(' | ') : ''}${result.notes.length ? '  [' + result.notes.join(' | ') + ']' : ''}`)
  }
} finally {
  await browser.close()
}
report.summary = { cases: report.cases.length, passed: report.cases.filter((c) => c.status === 'passed').length, failed: report.cases.filter((c) => c.status === 'failed').length }
await writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify({ result: report.summary.failed ? 'failed' : 'passed', output, ...report.summary }))
process.exitCode = report.summary.failed ? 1 : 0
