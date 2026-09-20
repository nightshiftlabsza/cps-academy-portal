'use strict';
const assert=require('node:assert/strict');
const {createServer}=require('../scripts/serve.cjs');
const {injectAuth}=require('./test-auth-helper.cjs');
const {launchBrowser}=require('./test-browser-helper.cjs');
(async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await launchBrowser({headless:true});
 try{for(const width of [320,360,390,430]){
  const c=await browser.newContext({viewport:{width,height:740},serviceWorkers:'block'});
  await injectAuth(c, 'admin');
  const p=await c.newPage();
  const base=`http://127.0.0.1:${server.address().port}`;
  const fits=async label=>assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&[...document.querySelectorAll('dialog[open]')].every(d=>d.scrollWidth<=d.clientWidth+1)),`${width}px overflow: ${label}`);
  await p.goto(base);await p.locator('#page h1').waitFor();
  await p.locator('#mobile-prefs-btn').click();await p.locator('#activate-mock-profile-btn').click();await p.keyboard.press('Escape');
  await p.locator('#more-navigation').click();await p.locator('#all-sections [data-nav="profile/logbook"]').click();await p.locator('#logbook-slice-file').waitFor({state:'attached'});await fits('logbook import');
  const fixture={schemaVersion:1,personId:'person-5b2737d41e4ac7b28700df42',canonicalName:'QA Profile',entries:Array.from({length:80},(_,i)=>({id:'qa-'+i,sessionId:'qa-session-'+i,role:'Presenter',date:'2026-01-01',title:'Long teaching session '+('Participant'.repeat(15))}))};
  await p.locator('#logbook-slice-file').setInputFiles({name:'qa-logbook.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await p.locator('.logbook-table-container').waitFor();await fits('80-row logbook');
  assert.equal(await p.locator('.logbook-table-container tbody tr').count(),80);await p.locator('.logbook-table-container tbody tr').last().scrollIntoViewIfNeeded();await fits('last logbook record');
  await p.locator('#mobile-prefs-btn').click();await p.locator('#admin-toggle').check();await p.keyboard.press('Escape');
  await p.locator('#feedback-trigger-btn').click();await p.locator('#issue-description').fill('QA local-only report '+('LongUnbrokenText'.repeat(25)));await fits('issue form');await p.locator('#submit-issue-btn').click();
  await p.locator('#more-navigation').click();await p.locator('#all-sections [data-nav="Issue Reports"]').click();await p.locator('[data-issue-card]').waitFor();await fits('admin issues');await p.locator('[data-update-status]').first().selectOption('Resolved');await fits('resolved issue');
  await c.close();console.log(`${width}px: logbook import, all 80 rows, local issue form and admin triage passed`);
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
