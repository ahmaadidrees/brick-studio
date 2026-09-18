// Desktop editor space check after the flows v2 chrome (W6): category + search in the drawer, one placement surface
// (the command strip), selection color / rotate / height through the strip's Color popover and Adjust row, the
// camera cluster, exact JSON export through the "This build" menu, cold reload, drawer collapse.
// Environment: PLAYWRIGHT_MODULE, DESKTOP_TEST_ORIGIN (default http://127.0.0.1:5234), DESKTOP_TEST_OUTPUT.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile}from'node:fs/promises';
import { launchOptions, loadChromium } from './lib/env.mjs';
import { loadLocators, makeLocate } from './lib/ui.mjs';
const chromium=await loadChromium();
const origin=process.env.DESKTOP_TEST_ORIGIN||'http://127.0.0.1:5234',out=process.env.DESKTOP_TEST_OUTPUT||'docs/qa/desktop-space-2026-09-15/local';
await mkdir(out,{recursive:true});const locate=makeLocate(await loadLocators());const b=await chromium.launch(launchOptions());const results=[],errors=[];
const fits=async(l,w,h)=>{const r=await l.boundingBox();assert(r&&r.x>=0&&r.y>=0&&r.x+r.width<=w+1&&r.y+r.height<=h+1,JSON.stringify(r));};
try{for(const[width,height]of[[1024,600],[1280,720],[1366,768],[1920,1080]]){
const c=await b.newContext({viewport:{width,height},acceptDownloads:true});
if(process.env.DESKTOP_TEST_BYPASS)await c.route('**/*',r=>r.continue(new URL(r.request().url()).origin===new URL(origin).origin?{headers:{...r.request().headers(),'x-vercel-protection-bypass':process.env.DESKTOP_TEST_BYPASS}}:{}));
const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/build');await p.getByRole('button',{name:'Start building',exact:true}).click();
assert.equal(await p.getByRole('button',{name:'Box select bricks',exact:true}).isVisible(),false);
await p.getByRole('combobox',{name:'Brick category',exact:true}).selectOption('plates');assert.equal(await p.getByTitle('2 × 4 Brick',{exact:true}).count(),0);await p.getByRole('searchbox',{name:'Search bricks',exact:true}).fill('2 × 4');await p.getByTitle('2 × 4 Plate',{exact:true}).click();
// One placement surface: the command strip in its brush state.
await locate(p,'stripBrush').waitFor();assert.equal(await p.locator('[data-testid="command-strip"]').count(),1);
await locate(p,'placePositioned').first().click();await locate(p,'stripCancel').click();
await p.getByRole('searchbox',{name:'Search bricks',exact:true}).fill('');await p.getByRole('combobox',{name:'Brick category',exact:true}).selectOption('all');
await locate(p,'jumpToBrick').selectOption({index:1});
const panel=locate(p,'stripSelected');await panel.waitFor();await fits(p.locator('[data-testid="command-strip"]'),width,height);assert.equal(await panel.locator('.color-grid').count(),0);
await panel.getByRole('button',{name:'Recolor brick',exact:true}).click();await locate(p,'stripColorDialog').waitFor();await locate(p,'stripColorDialog').getByRole('button',{name:'Choose any brick color',exact:true}).click();await p.getByRole('textbox',{name:'Hex color',exact:true}).fill('#12abcd');await p.getByRole('button',{name:'Apply color',exact:true}).click();
await p.keyboard.press('Escape');await locate(p,'stripColorDialog').waitFor({state:'hidden'}).catch(()=>{});
await panel.getByRole('button',{name:'Rotate brick',exact:true}).click();await panel.getByRole('button',{name:'Adjust',exact:true}).click();await p.getByRole('button',{name:'Raise brick one plate',exact:true}).click();await fits(p.locator('[data-testid="command-strip"]'),width,height);
await p.screenshot({path:`${out}/${width}-adjust.png`,animations:'disabled'});await panel.getByRole('button',{name:'Adjust',exact:true}).click();
await p.getByRole('button',{name:'Top view',exact:true}).click();assert.equal(await p.getByRole('button',{name:'Top view',exact:true}).getAttribute('aria-pressed'),'true');await locate(p,'cameraFrame').click();await p.waitForTimeout(300);await fits(locate(p,'cameraCluster'),width,height);
const catalog=await p.locator('.part-grid').evaluate(el=>{const r=el.getBoundingClientRect();return{height:r.height,fullyVisible:[...el.querySelectorAll('.library-part')].filter(x=>{const b=x.getBoundingClientRect();return b.top>=r.top&&b.bottom<=r.bottom}).length}});
await p.screenshot({path:`${out}/${width}-selected.png`,animations:'disabled'});
await locate(p,'worldMenu').click();const pending=p.waitForEvent('download');await locate(p,'menuExport').click();const download=await pending;const doc=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(doc.bricks.length,1);assert.equal(doc.bricks[0].partId,'plate_2x4');assert.equal(doc.bricks[0].color,'#12abcd');assert.equal(doc.bricks[0].rotation,1);assert.equal(doc.bricks[0].y,1);
await p.reload();await locate(p,'worldMenu').waitFor();await p.getByLabel('1 of 1000 brick capacity',{exact:true}).waitFor({state:'attached'});await p.waitForFunction(()=>document.querySelector('.command-strip-jump select')?.options.length===2);
await p.getByRole('button',{name:'Collapse brick drawer',exact:true}).click();await fits(locate(p,'cameraCluster'),width,height);await fits(p.locator('[data-testid="command-strip"]'),width,height);await locate(p,'openBrickDrawer').click();
results.push({width,height,catalog,checks:['category + search','one placement surface (command strip)','selection color/rotate/height via strip','exact JSON export via This build','cold reload','camera cluster','drawer collapse','bounded strip and cluster','mouse-only Box Select hidden']});await c.close();}
assert.deepEqual(errors,[]);await writeFile(`${out}/results.json`,JSON.stringify({origin,at:new Date().toISOString(),results,errors},null,2));console.log(JSON.stringify({passed:results.length,errors}));}finally{await b.close()}
