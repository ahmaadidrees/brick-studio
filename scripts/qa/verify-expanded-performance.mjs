/**
 * Expanded-world geometry, physics and frame-cadence rehearsal against a local Vite dev server.
 * Environment: PLAYWRIGHT_MODULE, CHROME_PATH, UI_ORIGIN (localhost only: the harness replaces the guest
 * document through the store), UI_OUTPUT. Host load is recorded before and after so noisy runs can be repeated.
 * See docs/brand/qa/README.md and docs/classroom/EXPANDED-PERFORMANCE-QA.md.
 */
import {writeFile} from 'node:fs/promises'
import { hostSnapshot, launchOptions, loadChromium, localOrigin, outputDir } from './lib/env.mjs'
const chromium=await loadChromium()
const origin=localOrigin('UI_ORIGIN','http://127.0.0.1:5190','the harness replaces the guest document in the loaded store.')
const output=await outputDir('UI_OUTPUT','/tmp/brick-expanded-performance')
const browser=await chromium.launch(launchOptions())
const report={timestamp:new Date().toISOString(),origin,hostBefore:hostSnapshot(),scenes:[]}
try {
 const context=await browser.newContext({viewport:{width:1366,height:768}})
 const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(origin+'/build');await page.getByRole('button',{name:'World menu',exact:true}).waitFor()
 await page.evaluate(async()=>{const url=performance.getEntriesByType('resource').map(e=>e.name).filter(u=>u.includes('/src/brick/store.ts')).at(-1);window.qaStore=(await import(url)).useBrickStore});
 const dismiss=page.getByRole('button',{name:'Dismiss quick start',exact:true});if(await dismiss.count())await dismiss.click();
 report.geometry=await page.evaluate(async()=>{
 const {createBrickGeometry}=await import('/src/brick/geometry.ts');const parts=await import('/src/brick/parts.ts');const docs=await import('/src/brick/brickDocument.ts');const results=[]
 for(const studs of ['none','auto','full']) {const def={id:'custom_perf_'+studs,name:'Maximum',template:'solid',width:64,depth:64,height:192,studs};const part=parts.customPartToBrickPart(def);let start=performance.now();const g=createBrickGeometry(part,{cache:false});const geometryMs=performance.now()-start;const bytes=Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,0)+(g.index?.array.byteLength??0);const doc=docs.createBrickStudioDocument([{id:'max',partId:def.id,x:32,y:0,z:32,rotation:0,color:'#ef4444'}],{plateSize:128,customParts:[def]});start=performance.now();const validated=docs.validateBrickStudioDocument(doc);results.push({studs,geometryMs,triangles:(g.index?.count??g.attributes.position.count)/3,bytes,validationMs:performance.now()-start,valid:validated.ok,error:validated.error});g.dispose()};return results
 });console.log('GEOMETRY',JSON.stringify(report.geometry))
 for(const environmentId of ['toy-room','sky-island','brick-valley']) {
 await page.evaluate(async env=>{const useBrickStore=window.qaStore;const {createBrickStudioDocument}=await import('/src/brick/brickDocument.ts');const customParts=[{id:'custom_perf_max',name:'Maximum',template:'solid',width:64,depth:64,height:192,studs:'full'}];useBrickStore.getState().restoreDocument(createBrickStudioDocument([{id:'max',partId:'custom_perf_max',x:0,z:0,y:0,rotation:0,color:'#ef4444'}],{environmentId:env,plateSize:128,customParts}));},environmentId)
 await page.waitForTimeout(2500)
 await page.evaluate(async()=>{const useBrickStore=window.qaStore;useBrickStore.getState().setMode('explore')})
 const scene={environmentId};try{await page.waitForFunction(async()=>{const useBrickStore=window.qaStore;return useBrickStore.getState().exploreSpawnStatus==='ready'},null,{timeout:20000})}catch(e){scene.spawnError=e.message}
 scene.spawn=await page.evaluate(async()=>{const useBrickStore=window.qaStore;const s=useBrickStore.getState();return{mode:s.mode,status:s.exploreSpawnStatus,position:s.exploreLastSafePosition,metadata:s.documentMetadata}})
 scene.frames=await page.evaluate(async()=>{const times=[];let prev=performance.now();await new Promise(resolve=>{const step=t=>{times.push(t-prev);prev=t;if(times.length<120)requestAnimationFrame(step);else resolve()};requestAnimationFrame(step)});times.shift();times.sort((a,b)=>a-b);return{p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],max:times.at(-1)}})
 scene.render=await page.evaluate(async()=>{const url=performance.getEntriesByType('resource').map(e=>e.name).find(u=>u.includes('/@react-three_fiber.js'));if(!url)return{unavailable:true};const {_roots}=await import(url);const root=[..._roots.values()][0]?.store.getState();return root?{render:root.gl.info.render,memory:root.gl.info.memory,renderer:root.gl.getContext().getParameter(root.gl.getContext().RENDERER)}:{unavailable:true}})
 await page.evaluate(async()=>{const useBrickStore=window.qaStore;useBrickStore.getState().setTouchMove(1,0,1,true)})
 await page.waitForTimeout(12000)
 scene.afterTravel=await page.evaluate(async()=>{const useBrickStore=window.qaStore;useBrickStore.getState().setTouchMove(0,0,0,false);const s=useBrickStore.getState();return{mode:s.mode,status:s.exploreSpawnStatus,position:s.exploreLastSafePosition}})
 await page.evaluate(async()=>{window.qaStore.setState({exploreLastSafePosition:{x:0,y:.39,z:5}});const s=window.qaStore.getState();s.requestRespawn()});await page.waitForTimeout(1500);await page.evaluate(()=>window.qaStore.getState().setTouchMove(-.7,-.7,1,true));await page.waitForTimeout(3000);scene.returnLeg=await page.evaluate(()=>{const s=window.qaStore.getState();s.setTouchMove(0,0,0,false);return {status:s.exploreSpawnStatus,position:s.exploreLastSafePosition}});await page.screenshot({path:output+'/'+environmentId+'.png'});scene.errors=[...errors];report.scenes.push(scene);console.log('SCENE',JSON.stringify(scene))
 }
 await context.close()
}finally{report.hostAfter=hostSnapshot();await writeFile(output+'/results.json',JSON.stringify(report,null,2));await browser.close()}
