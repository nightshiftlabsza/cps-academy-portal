'use strict';
// Local responsive and touch regression checks; no external links are opened.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createServer}=require('../scripts/serve.cjs');
const {chromium}=require('playwright-core');
const {injectAuth}=require('./test-auth-helper.cjs');
const routes=['Home','Morning Report','CPS Academy VMRs','Special VMRs','Student Forum','Residency Programs','Leader of the Week','Members','OrgStructure','CRC','CRC - retired','Podcast Episodes','Schema review','Research @CPSolvers','Conferences','Important links','Workspace','profile/logbook'];
(async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 const base=`http://127.0.0.1:${server.address().port}`;
 let checks=0;
 try{
 for(const width of [320,360,390,430,820,1440]){
  const context=await browser.newContext({viewport:{width,height:850},serviceWorkers:'block'});
  await injectAuth(context, 'admin');
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  const fits=async label=>{
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}px document overflow: ${label}`);
   const bad=await p.evaluate(()=>[...document.querySelectorAll('dialog[open]')].some(d=>d.scrollWidth>d.clientWidth+1));
   assert(!bad,`${width}px dialog overflow: ${label}`);checks++;
  };
  const shot=async name=>{if(process.env.CPS_QA_SCREENSHOTS){fs.mkdirSync('screenshots/mobile-audit',{recursive:true});await p.screenshot({path:`screenshots/mobile-audit/${width}-${name}.png`});}};
  for(const route of routes){
   await p.goto(base+'/#'+encodeURIComponent(route));await p.locator('#page h1').waitFor();await fits(route);await shot(route.replaceAll(/[^a-z0-9]/gi,'-'));
   if(await p.locator('#scope-select').count()){
    assert.equal(await p.locator('.schedule-secondary-filters .schedule-secondary-filters').count(),0);
    await p.locator('.schedule-secondary-filters').evaluate(d=>d.open=true);
    await p.locator('#scope-select').selectOption('All');await fits(route+' filters');
    await p.locator('.schedule-secondary-filters').evaluate(d=>d.open=false);
   }
   // Exercise every available representation, including the intentional comparison matrix.
   const views=await p.locator('[data-set-view]').evaluateAll(els=>els.map(e=>e.dataset.setView));
   for(const view of views){await p.locator(`[data-set-view="${view}"]`).click();await fits(route+' '+view);}
   if(await p.locator('#view').count()){await p.locator('#view').click();await fits(route+' alternate');}
   if(width<=760&&await p.locator('.mobile-record details').count()){
    await p.locator('.mobile-record summary').first().click();assert(await p.locator('.mobile-record details').first().evaluate(d=>d.open));await fits(route+' all fields');
   }
   const opener=p.locator('[data-open][data-area]').first();
   if(await opener.count()){
    await opener.click();await p.locator('#detail-dialog[open]').waitFor();await fits(route+' detail');await shot(route.replaceAll(/[^a-z0-9]/gi,'-')+'-detail');await p.keyboard.press('Escape');
   }
  }
  await p.goto(base+'/#Members');await p.locator('#page h1').waitFor();
  await p.locator('#global-search').fill('no-matching-record-qa-xyz');await p.getByRole('heading',{name:'No matching records'}).waitFor();await fits('empty search');await p.locator('#global-search').fill('');
  if(width<=760){
   await p.locator('#more-navigation').click();await fits('all sections');await p.locator('#all-sections [data-nav="Workspace"]').click();await p.getByRole('heading',{name:'Workspace',exact:true}).waitFor();
   assert.equal(await p.locator('#mobile-nav').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
   await p.locator('#mobile-prefs-btn').click();await fits('preferences');await shot('preferences');await p.locator('#appearance-mode').selectOption('dark');await fits('dark preferences');await p.keyboard.press('Escape');
   await p.locator('#more-navigation').click();await fits('dark navigation');await p.keyboard.press('Escape');
  }
  assert.deepEqual(errors,[]);await context.close();console.log(`${width}px: all 18 sections, views, filters and available details passed`);
 }
 // Oversized content is deliberately synthetic and kept in an isolated browser context.
 const fixture=JSON.parse(JSON.stringify(require('../workbook.json')));
 const long='LongUnbrokenName'.repeat(18);
 for(const area of Object.values(fixture))if(area.records?.length){for(const r of area.records.slice(0,2))for(const key of Object.keys(r.fields)){
  if(!/date|time|status|type|recording|uploaded|yes|no/i.test(key))r.fields[key]=/link|url/i.test(key)?'https://example.invalid/'+long:long+' · '+('Participant Name; '.repeat(12));
 }}
 for(const width of [320,360,390,430]){
  const c=await browser.newContext({viewport:{width,height:740},serviceWorkers:'block'});
  await injectAuth(c, 'admin');
  const p=await c.newPage();
  await p.route('**/workbook.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(fixture)}));
  for(const route of ['Members','OrgStructure','Important links','Podcast Episodes','Schema review','Research @CPSolvers']){
   await p.goto(base+'/#'+encodeURIComponent(route));await p.locator('#page h1').waitFor();
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}px long-content overflow: ${route}`);checks++;
   await p.locator('[data-open][data-area]').first().click();await p.locator('#detail-dialog[open]').waitFor();
   assert(await p.locator('#detail-dialog').evaluate(d=>d.scrollWidth<=d.clientWidth+1),`${width}px long detail overflow: ${route}`);await p.keyboard.press('Escape');
  }
  await c.close();
 }
 console.log(`${checks} responsive assertions passed, including long names, participant lists and URLs.`);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
