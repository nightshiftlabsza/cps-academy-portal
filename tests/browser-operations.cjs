'use strict';
// Runs locally with optional playwright-core and Chromium/Edge; no real meeting is opened.
const assert=require('node:assert/strict');
const {createServer}=require('../scripts/serve.cjs');
const core=require('../session-core.js');
const workbook=require('../workbook.json');
const KEY='cps-hub-workspace-v2';
(async()=>{
 const {chromium}=require('playwright-core');
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  const base=`http://127.0.0.1:${server.address().port}`;
  for(const width of [1440,390]){
   const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Africa/Johannesburg',acceptDownloads:true});
   const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text())});
   const nav=async area=>{await p.goto(base+'/#'+encodeURIComponent(area));await p.locator('#page h1').waitFor();};
   const open=async id=>{await p.locator(`[data-open="${id}"][data-area]`).first().click();await p.locator('#detail-dialog[open]').waitFor();};
   const close=async()=>{await p.keyboard.press('Escape');};
   const state=()=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
   const overflow=async label=>assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}px overflow at ${label}`);
   await nav('Home');await p.getByRole('heading',{name:'Home Dashboard'}).waitFor();
   await p.locator('#global-search').fill('residency');assert(await p.locator('#page').innerText().then(t=>/Residency/i.test(t)));
   await p.locator('#global-search').fill('no-such-record-zzzz');await p.getByRole('heading',{name:'No matching records'}).waitFor();await overflow('search');
   await nav('Morning Report');await p.locator('.schedule-secondary-filters').evaluate(el=>el.open=true);await p.locator('#filter').selectOption('All');
   await p.locator('#date-from').fill('2026-10-26');await p.locator('#date-to').fill('2026-10-26');
   const children=core.splitMorningReport(workbook['Morning Report'].records.find(r=>r.row===12));assert.equal(children.length,2);
   for(const child of children)assert(await p.locator(`[data-open="${child.id}"]`).count()>0,`split child ${child.id} visible in matrix`);
   await overflow('matrix');
   if(process.env.CPS_QA_SCREENSHOTS){require('node:fs').mkdirSync('screenshots',{recursive:true});await p.screenshot({path:`screenshots/operations-${width}.png`});}
   await p.locator('[data-set-view="cards"]').click();
   for(const child of children)assert(await p.locator(`[data-open="${child.id}"]`).count()>0,`split child ${child.id} visible in cards`);
   await open(children[0].id);await p.locator('[data-field="Presenter"]').fill('Local QA Session One');await p.locator('#dialog-primary').click();
   await p.reload();await p.locator('.schedule-secondary-filters').evaluate(el=>el.open=true);await p.locator('#filter').selectOption('All');await p.locator('#date-from').fill('2026-10-26');await p.locator('#date-to').fill('2026-10-26');
   await open(children[0].id);assert.equal(await p.locator('[data-field="Presenter"]').inputValue(),'Local QA Session One');await close();
   await open(children[1].id);assert.notEqual(await p.locator('[data-field="Presenter"]').inputValue(),'Local QA Session One');await close();
   await p.locator('#clear').click();await p.locator('.schedule-secondary-filters').evaluate(el=>el.open=true);await p.locator('#filter').selectOption('All');
   await p.locator('#session-type').selectOption('Spontaneous');await p.locator('#session-facilitator').selectOption('Austin');await p.locator('#gaps-only').check();
   assert.match(await p.locator('.results-count').innerText(),/[1-9]\d* matches/);await overflow('compound filters');
   await p.locator('[data-set-view="agenda"]').click();assert.match(await p.locator('#page').innerText(),/your time/i);await overflow('agenda');
   const calendar=p.locator('[data-calendar]:not([disabled])').first();await calendar.waitFor();
   const downloaded=p.waitForEvent('download');await calendar.click();const download=await downloaded;
   assert.match(download.suggestedFilename(),/\.ics$/i);const stream=await download.createReadStream();let ics='';for await(const chunk of stream)ics+=chunk.toString();assert.match(ics,/BEGIN:VCALENDAR\r\n/);assert.match(ics,/DTSTART:\d{8}T\d{6}Z/);
   await nav('CPS Academy VMRs');const vmr=await p.locator('[data-open][data-area]').first().getAttribute('data-open');await open(vmr);
   const original=await p.locator('[data-field="Facilitator"]').inputValue();await p.locator('[data-field="Facilitator"]').fill('QA Persisted Facilitator');await p.locator('#dialog-primary').click();await p.reload();await open(vmr);assert.equal(await p.locator('[data-field="Facilitator"]').inputValue(),'QA Persisted Facilitator');
   await p.locator('#restore-record').click();await p.locator('#confirm-restore').click();await open(vmr);assert.equal(await p.locator('[data-field="Facilitator"]').inputValue(),original);await close();
   await p.locator('#new-item-button').click();await p.locator('[data-field="Session title"]').fill('QA Temporary Draft');await p.locator('#dialog-primary').click();
   const draft=(await state()).added.find(r=>r.fields['Session title']==='QA Temporary Draft');assert(draft);
   await nav('Workspace');const backupEvent=p.waitForEvent('download');await p.locator('#export').click();const backup=await backupEvent;const bs=await backup.createReadStream();let json='';for await(const chunk of bs)json+=chunk.toString();assert.equal(JSON.parse(json).format,'cps-hub-backup-v2');
   await p.locator('#import').setInputFiles({name:'qa-backup.json',mimeType:'application/json',buffer:Buffer.from(json)});await p.locator('#import-preview-dialog[open]').waitFor();await p.locator('#import-preview-dialog').getByRole('button',{name:'Cancel',exact:true}).click();assert((await state()).added.some(r=>r.id===draft.id));
   await p.locator('#import').setInputFiles({name:'qa-backup.json',mimeType:'application/json',buffer:Buffer.from(json)});await p.locator('#confirm-import-btn').click();assert((await state()).added.some(r=>r.id===draft.id));await overflow('workspace');
   await p.evaluate(()=>localStorage.clear());await p.reload();
   await p.locator('#import').setInputFiles({name:'qa-backup.json',mimeType:'application/json',buffer:Buffer.from(json)});await p.locator('#confirm-import-btn').click();
   assert.equal((await state()).edits[children[0].id].Presenter,'Local QA Session One','fresh browser import restores child-session edits');
   assert((await state()).added.some(r=>r.id===draft.id),'fresh browser import restores drafts');
   await nav('CPS Academy VMRs');await p.locator('#global-search').fill('QA Temporary Draft');await open(draft.id);await p.locator('#restore-record').click();await p.locator('#confirm-restore').click();assert(!(await state()).added.some(r=>r.id===draft.id));
   assert.deepEqual(errors,[]);await context.close();console.log(`${width}px operations workflows passed`);
  }
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
