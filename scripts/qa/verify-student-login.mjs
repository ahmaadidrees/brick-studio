// Scoped synthetic-account browser release check. Credentials stay in memory.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
assert.equal(process.env.CLASSROOM_TEST_ALLOW_FIXTURES, 'yes');
const origin=process.env.LOGIN_TEST_ORIGIN, api=process.env.CLASSROOM_TEST_API;
assert(origin && api);
const out=process.env.LOGIN_TEST_OUTPUT || 'docs/qa/student-login-2026-09-15/browser';
await mkdir(out,{recursive:true});
async function request(path,method='GET',body,token){
 const response=await fetch(`${api}/classroom/${path}`,{method,headers:{'content-type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();assert(response.ok,`${path}: ${response.status} ${data.code || ''}`);return data;
}
const teacher=await request('auth/teacher-login','POST',{email:process.env.CLASSROOM_TEST_TEACHER_EMAIL,password:process.env.CLASSROOM_TEST_TEACHER_PASSWORD});
const cls=(await request('classes','POST',{name:`Login browser ${Date.now()}`},teacher.session.accessToken)).class;
const username=`qa${Date.now().toString(36)}`, password=`R${randomBytes(4).toString('hex').slice(0,5)}`;
const browser=await chromium.launch({channel:'chrome',headless:true});
// Protection credentials are attached only to this exact frontend origin, never the API.
async function newContext(options) {
 const context=await browser.newContext(options);
 if(process.env.LOGIN_TEST_BYPASS) await context.route('**/*', route => route.continue(new URL(route.request().url()).origin === new URL(origin).origin ? {headers:{...route.request().headers(),'x-vercel-protection-bypass':process.env.LOGIN_TEST_BYPASS}} : {}));
 return context;
}
let student, failure;const checks=[],errors=[];
try{
 const context=await newContext({viewport:{width:1366,height:768},acceptDownloads:true});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${origin}/build?classroom=signin`);
 await page.getByLabel('Class code',{exact:true}).fill(cls.code);
 await page.getByLabel('Username',{exact:true}).fill(username);
 await page.getByLabel('Password',{exact:true}).fill(password);
 await page.getByRole('radio',{name:'Create account',exact:true}).click();
 assert.equal(await page.getByLabel('Choose a username',{exact:true}).inputValue(),username);
 assert.equal(await page.getByLabel('Choose a password',{exact:true}).inputValue(),password);
 await page.getByLabel('Name your teacher knows',{exact:true}).fill('Synthetic login QA');
 const registered=page.waitForResponse(r=>r.url().endsWith('/classroom/auth/register') && r.request().method()==='POST');
 await page.getByRole('button',{name:'Create account and join',exact:true}).click();
 const response=await registered;assert.equal(response.status(),201);student=await response.json();
 await page.getByRole('radio',{name:'My Class',exact:true}).waitFor();
 assert.equal(await page.getByRole('radio',{name:'My Class',exact:true}).getAttribute('aria-checked'),'true');checks.push('browser six-character enrollment, preserved fields, My Class destination');
 const remembered=await page.evaluate(()=>JSON.parse(localStorage.getItem('brickgineers.last-class.v1')));
 assert.deepEqual(remembered,{name:cls.name,code:cls.loginCode});checks.push('only successful class name/code remembered');
 const doc={schemaVersion:2,partLibraryVersion:1,environmentId:'classic',customParts:[],bricks:[{id:'login-check-brick',partId:'brick_2x4',x:10,y:0,z:10,rotation:0,color:'#5888da'}]};
 const world=(await request('worlds','POST',{title:'Login QA saved build',document:doc},student.session.accessToken)).world;
 const db=await fetch(`${process.env.SUPABASE_URL}/rest/v1/brick_worlds?id=eq.${world.id}&select=document`,{headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`}});
 assert.equal(db.status,200);assert.deepEqual((await db.json())[0].document,doc);
 const state=await context.storageState();await context.close();
 const cold=await newContext({viewport:{width:1366,height:768},storageState:state,acceptDownloads:true});
 const returning=await cold.newPage();returning.on('pageerror',e=>errors.push(e.message));
 await returning.goto(`${origin}/build?classroom=signin`);
 await returning.getByRole('button',{name:'Change class',exact:true}).waitFor();
 assert.equal(await returning.getByLabel('Class code',{exact:true}).count(),0);
 assert.equal(await returning.getByLabel('Username',{exact:true}).inputValue(),'');
 assert.equal(await returning.getByLabel('Password',{exact:true}).inputValue(),'');
 await returning.getByRole('radio',{name:'Create account',exact:true}).click();
 assert.equal(await returning.getByLabel('Class code',{exact:true}).inputValue(),'');
 await returning.getByRole('radio',{name:'Sign in',exact:true}).click();
 await returning.getByRole('button',{name:'Change class',exact:true}).waitFor();
 checks.push('remembered return code is not reused for enrollment');
 await returning.screenshot({animations:'disabled',path:`${out}/remembered-class-desktop.png`});
 for(const width of [1024,390,320]){
   await returning.setViewportSize({width,height:844});
   assert(await returning.getByRole('button',{name:'Sign in',exact:true}).isVisible());
   assert(await returning.evaluate(()=>document.documentElement.scrollWidth <= innerWidth));
   await returning.screenshot({animations:'disabled',path:`${out}/remembered-class-${width}.png`});
 }
 await returning.setViewportSize({width:1366,height:768});
 await returning.getByLabel('Username',{exact:true}).fill(username);await returning.getByLabel('Password',{exact:true}).fill(password);
 await returning.getByRole('button',{name:'Sign in',exact:true}).click();
 await returning.getByRole('radio',{name:'My Class',exact:true}).waitFor();
 await returning.getByRole('radio',{name:'My Worlds',exact:true}).click();
 returning.on('dialog',dialog=>dialog.accept());
 await returning.getByRole('article',{name:world.title,exact:true}).getByRole('button',{name:'Open',exact:true}).click();
 await returning.getByRole('radio',{name:'My Worlds',exact:true}).waitFor({state:'hidden'});
 await returning.getByRole('button',{name:'World menu',exact:true}).waitFor();
 await returning.getByRole('button',{name:'World menu',exact:true}).click();
 const downloadPromise=returning.waitForEvent('download');
 await returning.getByRole('menuitem',{name:/Download build/}).click();
 const download=await downloadPromise;const file=await download.path();const exported=JSON.parse(await readFile(file,'utf8'));
 assert.deepEqual(exported,doc);checks.push('cold browser login and saved nonempty world download equals authoritative database');
 await returning.screenshot({animations:'disabled',path:`${out}/cold-saved-world.png`});
 await cold.close();
 const guest=await newContext({viewport:{width:390,height:844}});const entry=await guest.newPage();
 await entry.goto(origin);await entry.getByRole('link',{name:'Student login',exact:true}).first().waitFor();
 await entry.getByRole('link',{name:'Student login',exact:true}).last().click();
 await entry.getByLabel('Class code',{exact:true}).waitFor();
 await entry.getByRole('button',{name:'Teacher sign in',exact:true}).click();
 await entry.getByRole('button',{name:'Continue with Google',exact:true}).waitFor();
 await entry.getByRole('button',{name:'Student login',exact:true}).click();
 await entry.getByRole('button',{name:'Keep building as a guest',exact:true}).click();
 checks.push('mobile student entrance, separate teacher Google entry and guest exit');
 await guest.close();
 const teacherContext=await newContext({viewport:{width:1366,height:768}});
 await teacherContext.addInitScript(auth=>sessionStorage.setItem('brick-studio.classroom-session.v1',JSON.stringify(auth)),teacher);
 const dashboard=await teacherContext.newPage();await dashboard.goto(`${origin}/build?classroom=teacher`);
 await dashboard.getByRole('heading',{name:'Teacher dashboard',exact:true}).waitFor();
 await dashboard.getByLabel('Class',{exact:true}).selectOption(cls.id);
 await dashboard.getByRole('button',{name:'Invite students',exact:true}).click();
 await dashboard.getByRole('img',{name:'Scan to open this class on another device',exact:true}).waitFor();
 const invite=await dashboard.getByLabel('Class link',{exact:true}).inputValue();assert.equal(new URL(invite).searchParams.get('classCode'),cls.code);
 await dashboard.getByRole('button',{name:'Reset password for Synthetic login QA',exact:true}).waitFor();
 await dashboard.screenshot({animations:'disabled',path:`${out}/teacher-invite.png`});
 await dashboard.getByRole('button',{name:'Reset password for Synthetic login QA',exact:true}).click();
 await dashboard.getByLabel('Temporary password',{exact:true}).waitFor();
 assert.equal(await dashboard.getByLabel('Temporary password',{exact:true}).evaluate(el=>el===document.activeElement),true);
 await dashboard.getByRole('dialog',{name:'Teacher dashboard',exact:true}).getByRole('button',{name:'Cancel',exact:true}).click();
 await dashboard.setViewportSize({width:390,height:844});await dashboard.screenshot({animations:'disabled',path:`${out}/teacher-mobile.png`});
 const inviteContext=await newContext({viewport:{width:390,height:844}});const invitePage=await inviteContext.newPage();await invitePage.goto(invite);
 assert.equal(await invitePage.getByLabel('Class code',{exact:true}).inputValue(),cls.code);
 await invitePage.getByText(cls.name,{exact:true}).waitFor();
 await invitePage.screenshot({animations:'disabled',path:`${out}/student-invite.png`});
 await invitePage.getByRole('radio',{name:'Create account',exact:true}).click();assert.equal(await invitePage.getByLabel('Class code',{exact:true}).inputValue(),cls.code);
 await inviteContext.close();await teacherContext.close();
 checks.push('teacher dashboard direct entry, invite QR/link, password reset focus, mobile invite prefill and class lookup');
 assert.deepEqual(errors,[]);
}catch(error){failure=String(error);console.error(failure);const failedPage=browser.contexts().at(-1)?.pages().at(-1);if(failedPage)await failedPage.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally{
 const roster=(await request(`classes/${cls.id}/students`,'GET',undefined,teacher.session.accessToken)).students;
 for(const user of roster)await request(`classes/${cls.id}/students/${user.id}`,'PATCH',{suspended:true},teacher.session.accessToken);
 await request(`classes/${cls.id}`,'PATCH',{enrollmentOpen:false,collaborationOpen:false},teacher.session.accessToken);
 await browser.close();
 await writeFile(`${out}/results.json`,JSON.stringify({origin,api,classId:cls.id,checks,errors,failure,cleanup:'synthetic roster suspended; enrollment and collaboration closed'},null,2));
}
if(failure)process.exitCode=1;else console.log(JSON.stringify({passed:true,checks}));
