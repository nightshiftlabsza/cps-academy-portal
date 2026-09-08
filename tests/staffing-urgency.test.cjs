'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync(require.resolve('../app.js'),'utf8');
function harness(){
  const start=app.indexOf('function getStaffingUrgency('),end=app.indexOf('function weekKey(',start);
  assert(start>=0&&end>start,'staffing helpers are present');
  const context={today:()=> '2026-09-08',SessionCore:require('../session-core.js'),dateValue:r=>r.fields.Date,esc:String};
  vm.runInNewContext(app.slice(app.indexOf('function mrGaps('),start),context);
  vm.runInNewContext(app.slice(start,end),context);
  return context;
}
test('health excludes distant and past gaps, and distinguishes tomorrow from today',()=>{
 const h=harness(),r=date=>({id:date,fields:{Date:date},flags:[]});
 assert.equal(h.staffingHealth([r('2026-10-26'),r('2020-01-01')]).count,0);
 assert.equal(h.staffingHealth([r('2026-09-08')]).tomorrow,0);
 assert.equal(h.staffingHealth([r('2026-09-09')]).tomorrow,4);
 assert.equal(h.staffingHealth([r('2026-09-15')]).count,4);
 assert.match(h.staffingHealthBadge([]),/No sessions/);
 assert.match(h.staffingHealthBadge([r('2026-09-08')]),/slot-upcoming/);
 assert.match(h.staffingHealthBadge([r('2026-09-09')]),/slot-urgent/);
});
test('four empty roles render four single neutral claim slots without duplicate gap blocks',()=>{
 const h=harness(),r={id:'qa',fields:{Date:'2026-10-26'},flags:[]};
 const html=h.staffingGrid(r);
 assert.equal((html.match(/data-role=/g)||[]).length,4);
 assert.equal((html.match(/slot-open/g)||[]).length,4);
 assert(!/Missing|Gaps:|agenda-gaps-bar/.test(html));
 const cancelled={...r,fields:{...r.fields,Type:'none'}};
 assert.equal((h.staffingGrid(cancelled).match(/data-role=/g)||[]).length,0);
});
test('distant sessions have calm open slots, including the eighth day',()=>{
  const {getStaffingUrgency}=harness();
  for(const date of ['2026-09-16','2026-10-26','2027-01-01'])assert.equal(getStaffingUrgency(date,'2026-09-08'),'open');
});
test('today and tomorrow require urgent slots',()=>{
  const {getStaffingUrgency}=harness();
  assert.equal(getStaffingUrgency('2026-09-08','2026-09-08'),'urgent');
  assert.equal(getStaffingUrgency('2026-09-09','2026-09-08'),'urgent');
  assert.equal(getStaffingUrgency('2026-09-08'),'urgent','default reference uses current local calendar day');
});
test('two through seven days use upcoming tier without an uncovered boundary',()=>{
  const {getStaffingUrgency}=harness();
  for(const date of ['2026-09-10','2026-09-11','2026-09-15'])assert.equal(getStaffingUrgency(date,'2026-09-08'),'upcoming');
});
test('historical and unresolved dates never trigger staffing alarms',()=>{
  const {getStaffingUrgency}=harness();
  for(const date of ['2026-09-07','2020-01-01','','TBD','2026-02-30',null,undefined])assert.equal(getStaffingUrgency(date,'2026-09-08'),'open',String(date));
});
test('calendar-day boundaries survive daylight saving transitions',()=>{
  const {getStaffingUrgency}=harness();
  assert.equal(getStaffingUrgency('2026-03-09','2026-03-07'),'upcoming');
  assert.equal(getStaffingUrgency('2026-11-02','2026-10-31'),'upcoming');
  assert.equal(getStaffingUrgency('2026-03-15','2026-03-07'),'open');
});
test('leap and year boundaries preserve urgency tiers',()=>{
  const {getStaffingUrgency}=harness();
  assert.equal(getStaffingUrgency('2028-02-29','2028-02-28'),'urgent');
  assert.equal(getStaffingUrgency('2028-03-01','2028-02-28'),'upcoming');
  assert.equal(getStaffingUrgency('2027-01-01','2026-12-31'),'urgent');
  assert.equal(getStaffingUrgency('2027-01-08','2026-12-31'),'open');
});
