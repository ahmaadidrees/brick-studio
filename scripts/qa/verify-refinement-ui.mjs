/**
 * Local browser verification of the refined editor navigation (six viewports, Home → Continue round trip).
 * Environment: PLAYWRIGHT_MODULE, CHROME_PATH, UI_ORIGIN (localhost only), UI_OUTPUT. See docs/brand/qa/README.md.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { hostSnapshot, launchOptions, loadChromium, localOrigin, outputDir } from './lib/env.mjs'
const chromium = await loadChromium()
const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5190', 'this harness creates local guest test builds only.')
const output = await outputDir('UI_OUTPUT', '/tmp/brick-refinement-ui')
const browser = await chromium.launch(launchOptions())
const results = []
let failed = 0
try {
  for (const [width, height, touch] of [[1366,768,false],[1024,768,false],[768,1024,false],[390,844,true],[320,740,true],[844,390,true]]) {
    const context = await browser.newContext({ viewport: {width,height}, hasTouch:touch })
    const page = await context.newPage()
    const errors = []
    const failures = []
    try {
    page.on('pageerror', e => errors.push(e.message))
    await page.goto(`${origin}/build`)
    await page.getByRole('button', {name:'World menu',exact:true}).waitFor()
    const guide = page.getByRole('button', {name:'Dismiss quick start',exact:true})
    if (await guide.count()) await guide.click()
    const layout = await page.locator('.brick-header button, .brick-edit-toolbar button').evaluateAll(elements => {
      const visible = elements.filter(el => el.getBoundingClientRect().width && el.getBoundingClientRect().height)
      const boxes = visible.map(el => ({name:el.getAttribute('aria-label')||el.textContent.trim(),...el.getBoundingClientRect().toJSON()}))
      const outside = boxes.filter(b=>b.x<0||b.y<0||b.right>innerWidth+1||b.bottom>innerHeight+1)
      const overlaps = []
      for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++) {
        const a=boxes[i],b=boxes[j]
        if(Math.min(a.right,b.right)-Math.max(a.x,b.x)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1) overlaps.push([a.name,b.name])
      }
      return {outside,overlaps}
    })
    if (layout.outside.length) failures.push(`controls outside ${width}x${height}: ${layout.outside.map(b => `${b.name} ${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.width)},${Math.round(b.height)}`).join('; ')}`)
    if (layout.overlaps.length) failures.push(`controls overlap at ${width}x${height}: ${JSON.stringify(layout.overlaps)}`)
    await page.getByRole('button',{name:'Character',exact:true}).click()
    // Scoped to the sheet: the brick drawer also carries a selected category tab.
    await page.waitForFunction(()=>document.querySelector('[role="dialog"] [role="tab"][aria-selected="true"]')?.textContent==='Character')
    await page.keyboard.press('Escape')
    await page.getByRole('button',{name:'Settings',exact:true}).click()
    const panel = page.locator('[role="dialog"][aria-modal="true"]')
    await panel.waitFor()
    // Let the sheet's entrance transition finish: sample until two boxes 200 ms apart agree (max 3 s).
    let bounds = await panel.boundingBox()
    for (let i = 0; i < 15; i++) { await page.waitForTimeout(200); const next = await panel.boundingBox(); if (JSON.stringify(next) === JSON.stringify(bounds)) break; bounds = next }
    assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x+bounds.width <= width+1 && bounds.y+bounds.height <= height+1, 'Settings must fit the viewport')
    await page.keyboard.press('Escape')
    await page.getByRole('button',{name:'World menu',exact:true}).click()
    await page.getByRole('menuitem',{name:/My Worlds/}).waitFor()
    await page.getByRole('menuitem',{name:/My Class/}).waitFor()
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('button',{name:'World menu',exact:true}).evaluate(el=>el===document.activeElement), true)
    assert.equal(await page.locator('.app-recovery').count(), 0)
    await page.screenshot({path:`${output}/${width}x${height}.png`})
    assert.deepEqual(errors, [])
    results.push({width,height,touch,layout,errors,failures,status: failures.length ? 'failed' : 'passed'})
    if (failures.length) { failed++; console.log(`failed ${width}x${height}: ${failures.join(' | ')}`) } else console.log(`passed ${width}x${height}`)
    if(width===1366) {
      await page.getByRole('button',{name:'Place brick',exact:true}).first().click()
      await page.getByRole('button',{name:'World menu',exact:true}).click()
      await page.getByRole('menuitem',{name:/^Home/}).click()
      await page.waitForURL(`${origin}/`)
      const saved = await page.evaluate(()=>JSON.parse(localStorage.getItem('brick-studio.current-project.v1')))
      assert.equal(saved.bricks.length, 1)
      await page.getByRole('link',{name:/Continue building/}).first().click()
      await page.getByRole('button',{name:'World menu',exact:true}).waitFor()
      await page.getByLabel('1 of 1000 brick capacity', {exact:true}).waitFor({state:'attached'})
      assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('brick-studio.current-project.v1'))), saved)
      results.push({guestHomeContinue:'passed',savedBrickCount:1})
      console.log('passed guestHomeContinue')
    }
    } catch (error) {
      failed++
      const message = String(error).split('\n')[0]
      results.push({width,height,touch,status:'failed',failures:[...failures, message],errors})
      console.log(`failed ${width}x${height}: ${message}`)
      await page.screenshot({path:`${output}/${width}x${height}-failure.png`}).catch(() => {})
    }
    await context.close()
  }
  await writeFile(`${output}/results.json`, JSON.stringify({checkedAt:new Date().toISOString(),origin,commit:process.env.QA_COMMIT||null,host:hostSnapshot(),results,failed},null,2))
  console.log(JSON.stringify({result: failed ? 'failed' : 'passed',output,failed,results:results.length}))
  process.exitCode = failed ? 1 : 0
} finally { await browser.close() }
