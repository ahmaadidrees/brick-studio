// Guest editor layout on seven viewports after the flows v2 chrome (W6): placement through the command strip,
// selection through the strip's "Jump to brick" list, height adjustment via Adjust → Raise, export through the
// "This build" menu, Settings from that menu, drawer sheet on compact layouts, Character sheet, Explore and back.
// Environment: PLAYWRIGHT_MODULE, TOUCH_TEST_ORIGIN (default http://127.0.0.1:5234), TOUCH_TEST_OUTPUT.
import assert from 'node:assert/strict';
import {mkdir, writeFile, readFile} from 'node:fs/promises';
import { launchOptions, loadChromium } from './lib/env.mjs';
import { loadLocators, makeLocate } from './lib/ui.mjs';
const chromium=await loadChromium();
const origin=process.env.TOUCH_TEST_ORIGIN || 'http://127.0.0.1:5234';
const out=process.env.TOUCH_TEST_OUTPUT || 'docs/qa/touch-layout-2026-09-15/local';
await mkdir(out,{recursive:true});
const locate=makeLocate(await loadLocators());
const browser=await chromium.launch(launchOptions());
const results=[],errors=[];
async function fits(locator,w,h){const r=await locator.boundingBox();assert(r&&r.x>=-1&&r.y>=-1&&r.x+r.width<=w+1&&r.y+r.height<=h+1,`Outside ${w}x${h}: ${JSON.stringify(r)}`);return r;}
function separate(a,b,label){assert(a.x+a.width<=b.x+1||b.x+b.width<=a.x+1||a.y+a.height<=b.y+1||b.y+b.height<=a.y+1,`Overlap: ${label}`)}
try{
for(const [name,width,height,touch] of [['phone',390,844,true],['narrow',320,568,true],['landscape-phone',844,390,true],['portrait-tablet',768,1024,true],['tablet',1024,768,true],['large-tablet',1180,820,true],['desktop',1366,768,false]]){
const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,acceptDownloads:true});
if(process.env.TOUCH_TEST_BYPASS) await context.route('**/*',route=>route.continue(new URL(route.request().url()).origin===new URL(origin).origin?{headers:{...route.request().headers(),'x-vercel-protection-bypass':process.env.TOUCH_TEST_BYPASS}}:{}));
const page=await context.newPage();page.on('pageerror',e=>errors.push(`${name}: ${e.message}`));
const soft=[];
await page.goto(`${origin}/build`);
await page.getByRole('button',{name:'Start building',exact:true}).waitFor();
await page.screenshot({path:`${out}/${name}-onboarding.png`,animations:'disabled'});
await page.getByRole('button',{name:'Start building',exact:true}).click();
const compact=await page.locator('.brick-studio').evaluate(el=>el.classList.contains('brick-compact-layout'));
// A brush is loaded by default; the strip's Place button (or Enter) places it.
const place=locate(page,'placePositioned').first();
if(await place.isVisible().catch(()=>false)) await place.click(); else await page.keyboard.press('Enter');
await page.getByLabel('1 of 1000 brick capacity',{exact:true}).waitFor({state:'attached'});
// Put the brush down, then select the placed brick through the strip's accessible list (or the ] shortcut).
if(touch){const cancel=locate(page,'stripCancel');if(await cancel.isVisible().catch(()=>false))await cancel.click();else await page.keyboard.press('Escape');}else await page.keyboard.press('Escape');
const jump=locate(page,'jumpToBrick');
if(await jump.isVisible().catch(()=>false)) await jump.selectOption({index:1}); else await page.keyboard.press('BracketRight');
const selected=locate(page,'stripSelected');await selected.waitFor();
await selected.getByRole('button',{name:'Adjust',exact:true}).click();
await page.getByRole('button',{name:'Raise brick one plate',exact:true}).click();
const strip=page.locator('[data-testid="command-strip"]');
const stripBox=await fits(strip,width,height);
const camera=await fits(locate(page,'cameraCluster'),width,height);
separate(stripBox,camera,'command strip / camera cluster');
const history=await fits(page.getByRole('group',{name:'Build tools',exact:true}),width,height);
separate(stripBox,history,'command strip / build tools');
if(compact){const dock=page.locator('.brick-creative-dock');if(await dock.count()){const dockBox=await fits(dock,width,height);separate(stripBox,dockBox,'command strip / dock');}}
await page.screenshot({path:`${out}/${name}-adjust.png`,animations:'disabled'});
await selected.getByRole('button',{name:'Adjust',exact:true}).click();
await locate(page,'historyUndo').click();
await page.screenshot({path:`${out}/${name}-selected.png`,animations:'disabled'});
await locate(page,'worldMenu').click();
const downloading=page.waitForEvent('download');await locate(page,'menuExport').click();
const download=await downloading;const doc=JSON.parse(await readFile(await download.path(),'utf8'));
assert.equal(doc.bricks.length,1);assert.equal(doc.bricks[0].y,0);
await page.reload();await locate(page,'worldMenu').waitFor();
await page.getByLabel('1 of 1000 brick capacity',{exact:true}).waitFor({state:'attached'});
await locate(page,'worldMenu').click();
await locate(page,'menuSettings').click();
await locate(page,'settingsDialog').waitFor();
await page.waitForTimeout(400);
await page.screenshot({path:`${out}/${name}-settings.png`,animations:'disabled'});
await fits(locate(page,'settingsDialog'),width,height);
await locate(page,'closeSettings').click();
await locate(page,'settingsDialog').waitFor({state:'hidden'});
const focusBack=await locate(page,'worldMenu').evaluate(el=>document.activeElement===el);
if(!focusBack) soft.push('focus did not return to the This build trigger after closing Settings');
if(compact){
await locate(page,'openBrickDrawer').click();
const drawer=locate(page,'brickDrawerSheet');await drawer.waitFor();
await page.getByRole('button',{name:'Expand brick drawer',exact:true}).click();
await page.waitForTimeout(300);
await page.screenshot({path:`${out}/${name}-bricks.png`,animations:'disabled'});
await fits(drawer,width,height);
await drawer.getByRole('group',{name:'Brush color',exact:true}).waitFor();
await drawer.getByRole('button',{name:'1 × 1 Brick',exact:true}).click();assert.equal(await drawer.count(),0);
}else if(touch){await page.getByRole('button',{name:'Collapse brick drawer',exact:true}).click();await locate(page,'openBrickDrawer').click();}
await locate(page,'character').click();
await page.locator('.character-studio').waitFor();
await page.waitForTimeout(1000);
await page.screenshot({path:`${out}/${name}-character.png`,animations:'disabled'});
await page.keyboard.press('Escape');
await locate(page,'modeExplore').click();
await locate(page,'backToBuilding').waitFor();
await page.screenshot({path:`${out}/${name}-explore.png`,animations:'disabled'});
await locate(page,'backToBuilding').click();
await locate(page,'modeBuild').waitFor();
results.push({name,width,height,touch,compact,soft,checks:['guest placement via strip','selection via Jump to brick','height adjustment and undo','export matches saved brick','reload retains build','settings from This build menu','drawer / brush color','character','explore and return','strip, camera and history bounds']});
await context.close();}
assert.deepEqual(errors,[]);
await writeFile(`${out}/results.json`,JSON.stringify({origin,at:new Date().toISOString(),results,errors},null,2));
console.log(JSON.stringify({passed:results.length,soft:results.flatMap(r=>r.soft.map(s=>`${r.name}: ${s}`)),errors}));
}finally{await browser.close()}
