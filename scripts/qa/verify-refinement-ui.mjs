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
try {
  for (const [width, height, touch] of [[1366,768,false],[1024,768,false],[768,1024,false],[390,844,true],[320,740,true],[844,390,true]]) {
    const context = await browser.newContext({ viewport: {width,height}, hasTouch:touch })
    const page = await context.newPage()
    const errors = []
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
    assert.deepEqual(layout.outside, [], `Controls outside ${width}x${height}`)
    assert.deepEqual(layout.overlaps, [], `Controls overlap at ${width}x${height}`)
    await page.getByRole('button',{name:'Character',exact:true}).click()
    await page.waitForFunction(()=>document.querySelector('[role="tab"][aria-selected="true"]')?.textContent==='Character')
    await page.keyboard.press('Escape')
    await page.getByRole('button',{name:'Settings',exact:true}).click()
    const panel = page.locator('[role="dialog"][aria-modal="true"]')
    await panel.waitFor()
    const bounds = await panel.boundingBox()
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
    results.push({width,height,touch,layout,errors})
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
    }
    await context.close()
  }
  await writeFile(`${output}/results.json`, JSON.stringify({checkedAt:new Date().toISOString(),origin,host:hostSnapshot(),results},null,2))
  console.log(JSON.stringify({result:'passed',output,results},null,2))
} finally { await browser.close() }
