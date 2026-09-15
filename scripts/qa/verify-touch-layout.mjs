import assert from 'node:assert/strict';
import {mkdir, writeFile, readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin=process.env.TOUCH_TEST_ORIGIN || 'http://127.0.0.1:5234';
const out=process.env.TOUCH_TEST_OUTPUT || 'docs/qa/touch-layout-2026-09-15/local';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[],errors=[];
async function fits(locator,w,h){const r=await locator.boundingBox();assert(r&&r.x>=-1&&r.y>=-1&&r.x+r.width<=w+1&&r.y+r.height<=h+1,`Outside ${w}x${h}: ${JSON.stringify(r)}`);return r;}
function separate(a,b,label){assert(a.x+a.width<=b.x+1||b.x+b.width<=a.x+1||a.y+a.height<=b.y+1||b.y+b.height<=a.y+1,`Overlap: ${label}`)}
try{
for(const [name,width,height,touch] of [['phone',390,844,true],['narrow',320,568,true],['landscape-phone',844,390,true],['portrait-tablet',768,1024,true],['tablet',1024,768,true],['large-tablet',1180,820,true],['desktop',1366,768,false]]){
const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,acceptDownloads:true});
if(process.env.TOUCH_TEST_BYPASS) await context.route('**/*',route=>route.continue(new URL(route.request().url()).origin===new URL(origin).origin?{headers:{...route.request().headers(),'x-vercel-protection-bypass':process.env.TOUCH_TEST_BYPASS}}:{}));
const page=await context.newPage();page.on('pageerror',e=>errors.push(`${name}: ${e.message}`));
await page.goto(`${origin}/build`);
await page.getByRole('button',{name:'Start building',exact:true}).waitFor();
await page.screenshot({path:`${out}/${name}-onboarding.png`,animations:'disabled'});
await page.getByRole('button',{name:'Start building',exact:true}).click();
const compact=await page.locator('.brick-studio').evaluate(el=>el.classList.contains('brick-compact-layout'));
await page.getByRole('button',{name:'Place positioned brick',exact:true}).isVisible().then(async visible=>{if(visible) await page.getByRole('button',{name:'Place positioned brick',exact:true}).click();else await page.keyboard.press('Enter');});
// Stop the loaded brush, then select through the accessible navigator.
if(touch)await page.getByRole('button',{name:'Cancel',exact:true}).click();else await page.keyboard.press('Escape');
await page.getByRole('button',{name:'World menu',exact:true}).click();
await page.getByLabel('Placed bricks',{exact:true}).selectOption({index:1});
await page.keyboard.press('Escape');
if(touch){
const bar=page.locator('.touch-selection-bar');await bar.waitFor();
await bar.getByRole('button',{name:'Adjust',exact:true}).click();
await bar.getByRole('button',{name:'Raise brick one plate',exact:true}).click();
await bar.getByRole('button',{name:'Adjust',exact:true}).click();
const toolbar=await fits(page.locator('.brick-edit-toolbar'),width,height),selection=await fits(bar,width,height);
separate(toolbar,selection,'toolbar / selection');
if(compact){const dock=await fits(page.locator('.brick-creative-dock'),width,height);separate(selection,dock,'selection / dock');}
await page.getByRole('button',{name:'Undo',exact:true}).click();
}
await page.screenshot({path:`${out}/${name}-selected.png`,animations:'disabled'});
await page.getByRole('button',{name:'World menu',exact:true}).click();
const downloading=page.waitForEvent('download');await page.getByRole('menuitem',{name:/Download build/}).click();
const download=await downloading;const doc=JSON.parse(await readFile(await download.path(),'utf8'));
assert.equal(doc.bricks.length,1);assert.equal(doc.bricks[0].y,0);
await page.reload();await page.getByRole('button',{name:'World menu',exact:true}).click();
await page.waitForFunction(()=>document.querySelector('#placed-brick-select')?.options.length===2);
await page.getByRole('menuitem',{name:/Settings/}).click();
await page.getByRole('dialog',{name:'Settings',exact:true}).waitFor();
await page.screenshot({path:`${out}/${name}-settings.png`,animations:'disabled'});
await fits(page.getByRole('dialog',{name:'Settings',exact:true}),width,height);
await page.getByRole('button',{name:'Close settings',exact:true}).click();
assert(await page.getByRole('button',{name:'World menu',exact:true}).evaluate(el=>document.activeElement===el));
if(compact){
await page.getByRole('button',{name:'Open brick drawer',exact:true}).click();
const drawer=page.getByRole('dialog',{name:'Bricks',exact:true});await drawer.waitFor();
await page.getByRole('button',{name:'Expand brick drawer',exact:true}).click();
await page.screenshot({path:`${out}/${name}-bricks.png`,animations:'disabled'});
await fits(drawer,width,height);
await drawer.getByRole('button',{name:'1 × 1 Brick',exact:true}).click();assert.equal(await drawer.count(),0);
}else if(touch){await page.getByRole('button',{name:'Collapse brick drawer',exact:true}).click();await page.getByRole('button',{name:'Open brick drawer',exact:true}).click();}
await page.getByRole('button',{name:'Character',exact:true}).click();
await page.locator('.character-studio').waitFor();
await page.waitForTimeout(1000);
await page.screenshot({path:`${out}/${name}-character.png`,animations:'disabled'});
await page.keyboard.press('Escape');
await page.getByRole('button',{name:'Explore mode',exact:true}).click();
await page.getByRole('button',{name:'Back to building',exact:true}).waitFor();
await page.screenshot({path:`${out}/${name}-explore.png`,animations:'disabled'});
await page.getByRole('button',{name:'Back to building',exact:true}).click();
results.push({name,width,height,touch,compact,checks:['guest placement','selection','height adjustment and undo','export matches saved brick','reload retains build','settings and focus restoration','palette','character','explore and return','control bounds']});
await context.close();}
assert.deepEqual(errors,[]);
await writeFile(`${out}/results.json`,JSON.stringify({origin,at:new Date().toISOString(),results,errors},null,2));
console.log(JSON.stringify({passed:results.length,errors}));
}finally{await browser.close()}
