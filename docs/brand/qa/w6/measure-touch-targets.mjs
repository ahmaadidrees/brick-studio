/** W6 D7 check: measures every control in the character tab on touch viewports (mobile emulation, pointer: coarse) and lists any under 44×44. */
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH })
const result = {}
try {
  for (const [w, h] of [[390, 844], [320, 740], [844, 390]]) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true })
    const page = await context.newPage()
    const errors = []; page.on('pageerror', e => errors.push(e.message))
    await page.goto(`${process.env.UI_ORIGIN || 'http://127.0.0.1:5196'}/build`)
    await page.getByRole('button', { name: 'Character', exact: true }).waitFor()
    const dismiss = page.getByRole('button', { name: 'Dismiss quick start', exact: true })
    if (await dismiss.count()) await dismiss.click()
    await page.getByRole('button', { name: 'Character', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Scene & character', exact: true })
    await dialog.waitFor()
    await dialog.getByRole('radio', { name: /^Toy Figure/ }).dispatchEvent('click')
    await page.waitForFunction(() => !!document.querySelector('.character-preview canvas'))
    // Save one outfit so Favorite/Remove/confirm controls exist, then open the confirm.
    await dialog.getByRole('textbox', { name: 'Outfit name', exact: true }).fill('Size check')
    await dialog.getByRole('button', { name: 'Save outfit', exact: true }).dispatchEvent('click')
    await dialog.getByRole('button', { name: 'Remove Size check', exact: true }).dispatchEvent('click')

    const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches)
    const measured = await page.evaluate(() => {
      const root = document.querySelector('.character-studio')
      const els = [...root.querySelectorAll('button, input, [role="radio"], label.character-swatch')]
      return els.map(el => {
        const r = el.getBoundingClientRect()
        const name = el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30) || el.tagName
        return { name, w: Math.round(r.width), h: Math.round(r.height) }
      }).filter(m => m.w > 0 && m.h > 0)
    })
    const small = measured.filter(m => m.w < 44 || m.h < 44)
    const preview = measured.filter(m => /^(Idle|Walk|Run|Jump|Pause character animation|Play character animation)$/.test(m.name))
    const locks = measured.filter(m => /^Keep .* when mixing$/.test(m.name))
    result[`${w}x${h}`] = { coarse, controls: measured.length, small, preview, locks: locks.slice(0, 3), errors }
    await context.close()
  }
} finally { await browser.close() }
console.log(JSON.stringify(result, null, 1))
