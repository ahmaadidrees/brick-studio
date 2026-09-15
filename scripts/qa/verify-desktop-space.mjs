import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile}from'node:fs/promises';
const{chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.DESKTOP_TEST_ORIGIN||'http://127.0.0.1:5234',out=process.env.DESKTOP_TEST_OUTPUT||'docs/qa/desktop-space-2026-09-15/local';
await mkdir(out,{recursive:true});const b=await chromium.launch({channel:'chrome',headless:true});const results=[],errors=[];
const fits=async(l,w,h)=>{const r=await l.boundingBox();assert(r&&r.x>=0&&r.y>=0&&r.x+r.width<=w+1&&r.y+r.height<=h+1,JSON.stringify(r));};
try{for(const[width,height]of[[1024,600],[1280,720],[1366,768],[1920,1080]]){
const c=await b.newContext({viewport:{width,height},acceptDownloads:true});
if(process.env.DESKTOP_TEST_BYPASS)await c.route('**/*',r=>r.continue(new URL(r.request().url()).origin===new URL(origin).origin?{headers:{...r.request().headers(),'x-vercel-protection-bypass':process.env.DESKTOP_TEST_BYPASS}}:{}));
const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/build');await p.getByRole('button',{name:'Start building',exact:true}).click();
assert.equal(await p.getByRole('button',{name:'Box select bricks',exact:true}).isVisible(),false);
await p.getByRole('combobox',{name:'Brick category',exact:true}).selectOption('plates');assert.equal(await p.getByTitle('2 × 4 Brick',{exact:true}).count(),0);await p.getByRole('searchbox',{name:'Search bricks',exact:true}).fill('2 × 4');await p.getByTitle('2 × 4 Plate',{exact:true}).click();
await p.getByRole('button',{name:'Place positioned brick',exact:true}).click();await p.getByRole('button',{name:'Cancel',exact:true}).click();
await p.getByRole('searchbox',{name:'Search bricks',exact:true}).fill('');await p.getByRole('combobox',{name:'Brick category',exact:true}).selectOption('all');
await p.getByRole('button',{name:'World menu',exact:true}).click();await p.getByLabel('Placed bricks',{exact:true}).selectOption({index:1});await p.keyboard.press('Escape');
const panel=p.locator('.desktop-selection-panel');await panel.waitFor();await fits(panel,width,height);assert.equal(await panel.locator('.color-grid').count(),0);
await panel.getByRole('button',{name:'Recolor brick',exact:true}).click();await p.getByRole('textbox',{name:'Hex color',exact:true}).fill('#12abcd');await p.getByRole('button',{name:'Apply color',exact:true}).click();
await panel.getByRole('button',{name:'Rotate brick',exact:true}).click();await panel.getByRole('button',{name:'Adjust',exact:true}).click();await panel.getByRole('button',{name:'Raise brick one plate',exact:true}).click();await fits(panel,width,height);
await p.screenshot({path:`${out}/${width}-adjust.png`,animations:'disabled'});await panel.getByRole('button',{name:'Adjust',exact:true}).click();
await p.getByRole('combobox',{name:'Camera view',exact:true}).selectOption('top');await p.getByRole('button',{name:'Frame Build',exact:true}).click();await p.waitForTimeout(300);
const catalog=await p.locator('.part-grid').evaluate(el=>{const r=el.getBoundingClientRect();return{height:r.height,fullyVisible:[...el.querySelectorAll('.library-part')].filter(x=>{const b=x.getBoundingClientRect();return b.top>=r.top&&b.bottom<=r.bottom}).length}});
await p.screenshot({path:`${out}/${width}-selected.png`,animations:'disabled'});
await p.getByRole('button',{name:'World menu',exact:true}).click();const pending=p.waitForEvent('download');await p.getByRole('menuitem',{name:/Download build/}).click();const download=await pending;const doc=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(doc.bricks.length,1);assert.equal(doc.bricks[0].partId,'plate_2x4');assert.equal(doc.bricks[0].color,'#12abcd');assert.equal(doc.bricks[0].rotation,1);assert.equal(doc.bricks[0].y,1);
await p.reload();await p.getByRole('button',{name:'World menu',exact:true}).click();await p.waitForFunction(()=>document.querySelector('#placed-brick-select')?.options.length===2);await p.keyboard.press('Escape');
await p.getByRole('button',{name:'Collapse brick drawer',exact:true}).click();await fits(p.locator('.brick-edit-toolbar'),width,height);await p.getByRole('button',{name:'Open brick drawer',exact:true}).click();
results.push({width,height,catalog,checks:['category + search','one placement surface','selection color/rotate/height','exact JSON export','cold reload','camera view','palette collapse','bounded panels','mouse-only Box Select hidden']});await c.close();}
assert.deepEqual(errors,[]);await writeFile(`${out}/results.json`,JSON.stringify({origin,at:new Date().toISOString(),results,errors},null,2));console.log(JSON.stringify({passed:results.length,errors}));}finally{await b.close()}
