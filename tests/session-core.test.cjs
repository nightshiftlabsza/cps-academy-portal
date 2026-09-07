'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../session-core.js');
const workbook=require('../workbook.json');
const record=(p='6:00 AM PST',e='9:00 AM EST',date='2026-07-15',extra={})=>({id:'qa:1',source:'Morning Report',row:1,fields:{Date:date,'Pacific time (source)':p,'Eastern time (source)':e,Facilitator:'Test Person',Notes:'Reviewed',...extra},links:{},flags:[]});

test('real row 12 produces independent sessions while preserving source and inline cofacilitators',()=>{
 const source=workbook['Morning Report'].records.find(r=>r.row===12),before=JSON.stringify(source);
 const sessions=core.splitMorningReport(source);
 assert.equal(sessions.length,2);assert.notEqual(sessions[0].id,sessions[1].id);
 assert.equal(sessions[1].fields.Facilitator,'Alec & Austin');
 assert.equal(sessions[0].fields['Pacific time (source)'],'TBD');
 assert.equal(sessions[1].fields['Pacific time (source)'],'11 AM');
 for(const s of sessions){assert.equal(s.row,12);assert.deepEqual(s.session.sourceFields,source.fields);}
 assert.equal(JSON.stringify(source),before);
 assert.deepEqual(core.splitMorningReport(source).map(s=>s.id),sessions.map(s=>s.id));
});
test('inline names, slashes and ordinary notes never invent sessions',()=>{
 const r=record(undefined,undefined,undefined,{Facilitator:'Alex / Morgan & Robin',Notes:'Use differential / discussion & synthesis'});
 assert.equal(core.splitMorningReport(r).length,1);
});
test('fixed PST/EST retain standard offsets in summer; PT/ET follow daylight saving',()=>{
 assert.equal(core.parseSessionTime(record()).startUtc,'2026-07-15T14:00:00.000Z');
 assert.equal(core.parseSessionTime(record('6:00 AM PT','9:00 AM ET')).startUtc,'2026-07-15T13:00:00.000Z');
 assert.equal(core.parseSessionTime(record('06:00:00','09:00:00')).startUtc,'2026-07-15T13:00:00.000Z');
 assert.equal(core.parseSessionTime(record('6:00 AM PT','9:00 AM ET','2026-01-15')).startUtc,'2026-01-15T14:00:00.000Z');
});
test('irregular spacing/case is accepted without losing explicit timezone',()=>{
 const r=record(' 6:00am pst ',' 9:00 Am EST ');assert.equal(core.parseSessionTime(r).status,'resolved');
 assert.match(core.formatSessionTime(r,'Africa/Johannesburg'),/4:00\s*PM/i);
 assert.match(core.formatSessionTime(r,'Africa/Johannesburg'),/your time/i);
});
test('unknown times, impossible dates, contradictory clocks and ambiguous dates refuse export',()=>{
 for(const r of [record('TBD','TBD'),record('6 AM PST','10 AM EST'),record('6 AM PST','9 AM EST','2026-02-29'),record('6 AM PST','9 AM EST','03/04/2026'),record('12 ET',''),record('25:00','')]){
  const parsed=core.parseSessionTime(r);assert.equal(parsed.status,'unresolved',JSON.stringify(r.fields));assert.equal(parsed.startUtc,null);assert.ok(parsed.reason);assert.throws(()=>core.createCalendar(r,{title:'QA'}));
 }
 assert.equal(core.parseSessionTime(record('6 AM PST','9 AM EST','2028-02-29')).status,'resolved');
});
test('DST missing and repeated wall times are not guessed',()=>{
 for(const r of [record('2:30 AM PT','','2026-03-08'),record('1:30 AM PT','','2026-11-01')])assert.equal(core.parseSessionTime(r).status,'unresolved');
});
test('cross-midnight paired clocks resolve the same instant',()=>{
 assert.equal(core.parseSessionTime(record('11:00 PM PST','2:00 AM EST','2026-01-15')).startUtc,'2026-01-16T07:00:00.000Z');
});
test('assumed end is one hour and clearly identified',()=>{
 const p=core.parseSessionTime(record());assert.equal(p.durationAssumed,true);assert.equal(Date.parse(p.endUtc)-Date.parse(p.startUtc),3600000);
});
test('calendar uses CRLF, UTC, stable identity, escaped text, staff and safe UTF8 folding',()=>{
 const r=record(undefined,undefined,undefined,{Notes:'First, second; slash\\\nNext '+ 'é🙂'.repeat(70)});r.links.Zoom='https://example.invalid/meeting';
 const opts={title:'Teaching, reasoning; QA',now:new Date('2026-01-01T00:00:00Z')},ics=core.createCalendar(r,opts);
 assert.match(ics,/BEGIN:VCALENDAR\r\n/);assert.match(ics,/DTSTART:20260715T140000Z/);assert.match(ics,/DTEND:20260715T150000Z/);assert.equal(ics.replace(/\r\n/g,'').includes('\n'),false);
 for(const line of ics.split('\r\n'))assert.ok(Buffer.byteLength(line,'utf8')<=75,`Calendar line is ${Buffer.byteLength(line)} bytes`);
 const unfolded=ics.replace(/\r\n[ \t]/g,'');assert.match(unfolded,/SUMMARY:Teaching\\, reasoning\\; QA/);assert.ok(unfolded.includes('Test Person'));assert.ok(unfolded.includes('https://example.invalid/meeting'));assert.ok(unfolded.includes('é🙂'.repeat(70)));assert.ok(unfolded.includes('First\\, second\\; slash\\\\\\nNext'));
 assert.equal(ics.match(/^UID:(.+)$/m)[1],core.createCalendar(r,{...opts,now:new Date('2026-02-01T00:00:00Z')}).match(/^UID:(.+)$/m)[1]);
});
test('facets compose with AND, exact facilitator membership and staffing gaps',()=>{
 const r=record(undefined,undefined,undefined,{Type:'Spontaneous',Facilitator:'Alec & Austin'}),gaps=()=>['Scribe'];
 assert.equal(core.matchesFacets(r,{type:'Spontaneous',facilitator:'Austin',gapsOnly:true},gaps),true);
 assert.equal(core.matchesFacets(r,{type:'Academy',facilitator:'Austin',gapsOnly:true},gaps),false);
 assert.equal(core.matchesFacets(r,{type:'Spontaneous',facilitator:'Aus',gapsOnly:false},gaps),false);
 assert.equal(core.matchesFacets(r,{type:'Spontaneous',facilitator:'Austin',gapsOnly:true},()=>[]),false);
});


test('explicit ranges preserve duration including overnight sessions',()=>{
 const day=core.parseSessionTime(record('6:00 AM–7:30 AM PST','9:00 AM–10:30 AM EST'));
 assert.equal(day.status,'resolved');assert.equal(day.durationAssumed,false);assert.equal(day.endUtc,'2026-07-15T15:30:00.000Z');
 const night=core.parseSessionTime(record('11:00 PM–1:00 AM PST','2:00 AM–4:00 AM EST','2026-01-15'));
 assert.equal(night.status,'resolved');assert.equal(night.endUtc,'2026-01-16T09:00:00.000Z');
 assert.equal(core.parseSessionTime(record('6:00 AM–7:00 AM PST','9:00 AM–11:00 AM EST')).status,'unresolved');
});
test('VMR combined date/time fields resolve explicit zones but reject missing zones',()=>{
 const vmr={id:'vmr:qa',fields:{'Date / time (source)':'July 15, 2026 6:00 AM PST / 9:00 AM EST','Session title':'QA VMR'},links:{},flags:[]};
 assert.equal(core.parseSessionTime(vmr).startUtc,'2026-07-15T14:00:00.000Z');
 assert.equal(core.parseSessionTime({...vmr,fields:{...vmr.fields,'Date / time (source)':'July 15, 2026 6:00 AM'}}).status,'unresolved');
});
test('split block mismatches remain marked for review with untouched original fields',()=>{
 const r=record('6 AM\n&\n8 AM','9 AM\n&\n11 AM','2026-07-15',{Facilitator:'Shared name without session attribution'});
 for(const s of core.splitMorningReport(r)){assert.deepEqual(s.session.sourceFields,r.fields);assert.ok(s.flags.some(x=>/Facilitator/.test(x)));}
});
