// Optional browser regression checks. Install playwright-core and Chromium as documented.
const assert=require('node:assert/strict');
const {createServer}=require('../scripts/serve.cjs');
(async()=>{
 let chromium;try{({chromium}=require('playwright-core'))}catch{throw Error('Install the optional browser tools from README.md first.')}
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  for(const width of [1440,390]){
   const context=await browser.newContext({viewport:{width,height:900}});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
   const base=`http://127.0.0.1:${server.address().port}`;
   await p.goto(base);await p.getByRole('heading',{name:'Home Dashboard'}).waitFor();
   await p.getByRole('button',{name:'Open staffing schedule'}).click();
   await p.locator('#filter').selectOption('All');await p.locator('[data-open]').first().click();
   await p.locator('[data-field="Presenter"]').fill('Local QA assignment');await p.locator('#dialog-primary').click();await p.reload();
   await p.locator('#filter').selectOption('All');await p.locator('[data-open]').first().click();
   assert.equal(await p.locator('[data-field="Presenter"]').inputValue(),'Local QA assignment');await p.keyboard.press('Escape');
   await p.locator('[data-go="CPS Academy VMRs"]').click();await p.getByRole('link',{name:'Watch recording ↗'}).first().waitFor();
   await p.locator('#global-search').fill('no-such-record-zzzz');await p.getByRole('heading',{name:'No matching records'}).waitFor();
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await context.close();
  }
  console.log('Desktop/mobile browser checks passed.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e.message);process.exitCode=1});
