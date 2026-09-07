'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const normalize = value => String(value).normalize('NFKC').toLowerCase().replace(/[.]/g, '').replace(/\s+/g, ' ').trim();
const placeholder = value => /^(?:|[-–—?]+|tbd|tba|none|n\/?a|open|need(?:ed)?(?:\s+.*)?|cps team|team)$/i.test(value.trim());
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(+d) && d.toISOString().slice(0, 10) === value ? value : null;
}
function dateOf(fields) {
  return require('../session-core.js').parseDate(String(fields.Date || fields['Date / time (source)'] || '').trim()) || null;
}
// Delimit only outside parentheses; parenthetical geography and backup notes remain evidence.
function peopleTokens(raw) {
  let depth = 0, current = '', parts = [];
  const flush = () => { if (current.trim()) parts.push(current.trim()); current = ''; };
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '(') depth++;
    if (c === ')') depth = Math.max(0, depth - 1);
    const natural = depth === 0 && raw.slice(i).match(/^(?:\s+(?:and|with)\s+|\s+w\/)/i);
    if (natural) { flush(); i += natural[0].length - 1; }
    else if (!depth && /[&+/,|\n]/.test(c)) flush();
    else current += c;
  }
  flush(); return parts;
}
const ROLE_PATTERN = /\b(case\s+presenter|presenter|scribe|teaching\s+points?|TP|discord\s+chat|zoom\s+chat|chat\s+support)\s*:/gi;
function roleName(label) {
  if (/presenter/i.test(label)) return 'presenter';
  if (/teaching|^TP$/i.test(label)) return 'teaching_points';
  if (/chat/i.test(label)) return 'chat_support';
  return 'scribe';
}
function extractRoles(fields) {
  const segments = [], unparsed = [];
  for (const [field,role] of [['Facilitator','facilitator'],['Presenter','presenter'],['Chat support','chat_support'],...Array.from({length:4},(_,i)=>[`Active participant ${i+1}`,'discussant'])]) {
    if (String(fields[field] || '').trim()) segments.push({field,role,raw:String(fields[field])});
  }
  const field = 'Scribe / teaching points sign-ups', raw = String(fields[field] || '');
  const matches = [...raw.matchAll(ROLE_PATTERN)];
  if (raw.slice(0, matches[0]?.index ?? raw.length).trim()) unparsed.push({field,raw:raw.slice(0,matches[0]?.index ?? raw.length),reason:'unlabelled-role-text'});
  matches.forEach((match,index)=>segments.push({field,role:roleName(match[1]),raw:raw.slice(match.index + match[0].length,matches[index+1]?.index ?? raw.length).trim()}));
  return {segments,unparsed};
}
function identityIndex(registry) {
  if (registry.schemaVersion !== 1 || !Array.isArray(registry.identities)) throw new Error('Invalid identity registry');
  const aliases = new Map(), ids = new Set();
  for (const identity of registry.identities) {
    if (!/^person-[a-f0-9]{24}$/.test(identity.id) || ids.has(identity.id)) throw new Error('Invalid or duplicate canonical identity ID');
    ids.add(identity.id);
    for (const alias of [identity.name,...identity.aliases]) {
      const key = normalize(alias); if (!aliases.has(key)) aliases.set(key,new Set()); aliases.get(key).add(identity.id);
    }
  }
  return {resolve(raw) {
    const exact = aliases.get(normalize(raw));
    if (exact?.size === 1) return {id:[...exact][0]};
    if (exact?.size > 1) return {reason:'ambiguous-alias',candidates:[...exact].sort()};
    const stripped = raw.replace(/\([^)]*\)/g,'').trim();
    if (stripped !== raw && /\b(?:backup|back-up|or|cancel|strike)\b/i.test(raw)) return {reason:'conditional-assignment',candidates:[]};
    const clean = aliases.get(normalize(stripped));
    if (clean?.size === 1 && stripped.includes(' ')) return {id:[...clean][0]};
    const candidates = registry.identities.filter(p=>normalize(p.name).split(' ')[0] === normalize(stripped)).map(p=>p.id).sort();
    return {reason:candidates.length ? 'unverified-short-name' : 'unknown-alias',candidates};
  }};
}
function compile(workbook, registry, {asOf,sourceHash,registryHash,compilerHash=null,sessionParserHash=null,splitMorningReport}) {
  if (!validDate(asOf)) throw new Error('An explicit valid --as-of YYYY-MM-DD is required');
  if (typeof splitMorningReport !== 'function') throw new Error('Session splitter is required');
  const index = identityIndex(registry), people = Object.create(null), unresolved = [], rows = [], exclusions = [];
  let tokenCount=0,resolvedTokens=0,duplicateTokens=0,placeholderTokens=0,excludedTokens=0,sessionCount=0;
  for (const series of ['Morning Report','CPS Academy VMRs']) {
    if (!Array.isArray(workbook[series]?.records)) throw new Error(`Missing series: ${series}`);
    for (const record of workbook[series].records) {
      const sessions = series === 'Morning Report' ? splitMorningReport(record) : [record];
      const audit = {id:record.id,source:record.source,row:record.row,sourceHash:hash(JSON.stringify(record)),sessionIds:sessions.map(s=>s.id),tokens:0}; rows.push(audit);
      for (const session of sessions) {
        sessionCount++;
        const fields=session.fields,date=dateOf(fields), temporalState=!date?'unknown':date<asOf?'past':'scheduled';
        const ref={recordId:record.id,sessionId:session.id,source:record.source,row:record.row};
        const cancelled = /\b(?:cancelled|canceled|STRIKE)\b/i.test([fields.Type,fields.Status,fields.Notes,fields['Scribe / teaching points sign-ups'],...(session.flags||[])].join('\n'));
        const {segments,unparsed}=extractRoles(fields);
        unresolved.push(...unparsed.map(u=>({...ref,...u})));
        for(const issue of session.session?.unresolved || []) unresolved.push({...ref,reason:'session-boundary-needs-review',detail:issue});
        for (const segment of segments) {
          const tokens=peopleTokens(segment.raw);
          const boundaryUnclear=Object.hasOwn(session.session?.unassignedFields || {},segment.field);
          const conditional=/\b(?:or|backup|back-up|maybe)\b|\?/i.test(segment.raw);
          for (const raw of tokens) {
            tokenCount++; audit.tokens++;
            const evidence={...ref,field:segment.field,role:segment.role,raw};
            if(cancelled || /\b(?:STRIKE|cancelled|canceled)\b/i.test(raw)) {excludedTokens++; exclusions.push({...evidence,reason:'cancellation-or-strikethrough'});continue;}
            if(placeholder(raw)){placeholderTokens++;exclusions.push({...evidence,reason:'placeholder'});continue;}
            if(boundaryUnclear){unresolved.push({...evidence,reason:'unassigned-session-field',candidates:[]});continue;}
            if (conditional) {unresolved.push({...evidence,reason:'conditional-assignment',candidates:[]});continue;}
            const match=index.resolve(raw);
            if(!match.id){unresolved.push({...evidence,...match});continue;}
            resolvedTokens++;
            if(!people[match.id]) {const person=registry.identities.find(p=>p.id===match.id);people[match.id]={name:person.name,externalAccountId:null,entries:[]};}
            const person=people[match.id], entryId='assignment-'+hash(`${sourceHash}|${session.id}|${segment.role}|${match.id}`).slice(0,24);
            const existing=person.entries.find(e=>e.id===entryId);
            if(existing){existing.evidence.push(evidence);duplicateTokens++;continue;}
            person.entries.push({id:entryId,sessionId:session.id,date,temporalState,series,role:segment.role,status:'unverified-workbook-assignment',title:fields['Session title']||fields.Type||'',evidence:[evidence]});
          }
        }
      }
    }
  }
  for(const person of Object.values(people)) person.entries.sort((a,b)=>(b.date||'').localeCompare(a.date||'')||a.id.localeCompare(b.id));
  const unresolvedTokens=unresolved.filter(u=>u.role).length;
  if(tokenCount!==resolvedTokens+unresolvedTokens+placeholderTokens+excludedTokens) throw new Error('Token accounting failed');
  return {schemaVersion:1,asOf,sourceHash,registryHash,compilerHash,sessionParserHash,privacy:'PRIVATE_ADMIN_BACKFILL_NOT_A_PUBLIC_ASSET',identityContract:'Local canonical IDs require reviewed external account mapping. Assignments are not attendance.',audit:{sourceRows:rows.length,seriesRows:Object.fromEntries(['Morning Report','CPS Academy VMRs'].map(s=>[s,workbook[s].records.length])),sessions:sessionCount,tokenCount,resolvedTokens,duplicateTokens,unresolvedTokens,placeholderTokens,excludedTokens,uniqueAssignments:resolvedTokens-duplicateTokens},people,rows,unresolved,exclusions};
}
function writeImmutable(file,text,replace=false) {
  if(fs.existsSync(file)) {if(fs.readFileSync(file,'utf8')===text)return 'unchanged';if(!replace)throw new Error('Ledger differs; use a new --output path or explicit --replace after review');}
  const temp=`${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temp,text,{flag:'wx'});
    if (replace) fs.renameSync(temp,file);
    else fs.linkSync(temp,file); // Atomic create-if-absent; concurrent runs cannot overwrite.
  } finally {if(fs.existsSync(temp))fs.unlinkSync(temp);}
  return 'written';
}
function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    console.log('Compile the private workbook assignment ledger offline.\nUsage: node scripts/compile-logbooks.cjs --as-of YYYY-MM-DD [--input workbook.json] [--identities data/logbook-identities.json] [--output historical-contributions.json] [--replace]\nIdentical output is unchanged. Different output requires --replace or a new output path. Assignments do not certify attendance.');
    return;
  }
  const options={};for(let i=0;i<args.length;i++){if(args[i]==='--replace'){options.replace=true;continue;}if(!['--as-of','--input','--identities','--output'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw new Error(`Unknown or incomplete argument: ${args[i]}`);options[args[i].slice(2)]=args[++i];}
  const source=fs.readFileSync(path.resolve(options.input||path.join(ROOT,'workbook.json')));
  const registry=fs.readFileSync(path.resolve(options.identities||path.join(ROOT,'data/logbook-identities.json')));
  const ledger=compile(JSON.parse(source),JSON.parse(registry),{asOf:options['as-of'],sourceHash:hash(source),registryHash:hash(registry),compilerHash:hash(fs.readFileSync(__filename)),sessionParserHash:hash(fs.readFileSync(path.join(ROOT,'session-core.js'))),splitMorningReport:require('../session-core.js').splitMorningReport});
  const output=path.resolve(options.output||path.join(ROOT,'historical-contributions.json'));
  const protectedPaths=[options.input||path.join(ROOT,'workbook.json'),options.identities||path.join(ROOT,'data/logbook-identities.json'),__filename,path.join(ROOT,'session-core.js')].map(p=>path.resolve(p).toLowerCase());
  if(protectedPaths.includes(output.toLowerCase()))throw new Error('Output must not overwrite a source, identity registry or compiler file');
  const state=writeImmutable(output,JSON.stringify(ledger,null,2)+'\n',options.replace);
  console.log(JSON.stringify({state,output,audit:ledger.audit},null,2));
}
module.exports={compile,peopleTokens,extractRoles,identityIndex,dateOf,writeImmutable,hash,normalize};
if(require.main===module){try{main(process.argv.slice(2));}catch(error){console.error(error.message);process.exitCode=1;}}
