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
function normalizeRole(role) {
  if (!role) return null;
  const r = role.toLowerCase().replace(/[\s_-]+/g, '');
  if (r.includes('facilitator')) return 'facilitator';
  if (r.includes('presenter')) return 'presenter';
  if (r.includes('teach') || r === 'tp') return 'teaching_points';
  if (r.includes('chat')) return 'chat_support';
  if (r.includes('discussant') || r.includes('activeparticipant')) return 'discussant';
  if (r.includes('scribe')) return 'scribe';
  return roleName(role);
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
function buildAliasIndex(aliases, registry) {
  if (!aliases) return null;
  const ids = new Set(registry.identities.map(i => i.id));
  const decisions = Array.isArray(aliases.decisions) ? aliases.decisions : [];
  const occurrenceDecisions = [];
  const globalAliases = new Map();
  for (const d of decisions) {
    if (!d || typeof d !== 'object' || !d.id) continue;
    if (d.status !== 'accepted') continue;
    if (!d.personId || !ids.has(d.personId)) {
      throw new Error(`Alias decision ${d.id} references invalid or unpreserved personId: ${d.personId}`);
    }
    const isOccurrence = d.type === 'occurrence' || Boolean(d.sessionId || d.recordId || d.target?.sessionId || d.target?.recordId);
    if (isOccurrence) {
      occurrenceDecisions.push({
        id: d.id,
        personId: d.personId,
        sessionId: d.sessionId || d.target?.sessionId || null,
        recordId: d.recordId || d.target?.recordId || null,
        role: d.role || d.target?.role ? normalizeRole(d.role || d.target?.role) : null,
        raw: d.raw || d.target?.raw || d.alias || d.target?.alias || null,
        occurrenceIndex: d.occurrenceIndex !== undefined ? d.occurrenceIndex : (d.target?.occurrenceIndex !== undefined ? d.target.occurrenceIndex : null)
      });
    } else {
      const aliasRaw = d.alias || d.raw || d.target?.alias || d.target?.raw;
      if (!aliasRaw) continue;
      const key = normalize(aliasRaw);
      if (!globalAliases.has(key)) globalAliases.set(key, []);
      globalAliases.get(key).push({ id: d.id, personId: d.personId });
    }
  }
  if (Array.isArray(aliases.globalAliases)) {
    for (const g of aliases.globalAliases) {
      if (!g || typeof g !== 'object' || !g.id || g.status !== 'accepted') continue;
      if (!g.personId || !ids.has(g.personId)) throw new Error(`Global alias ${g.id} references invalid personId: ${g.personId}`);
      const key = normalize(g.alias || g.raw);
      if (!globalAliases.has(key)) globalAliases.set(key, []);
      globalAliases.get(key).push({ id: g.id, personId: g.personId });
    }
  }
  return {
    matchOccurrence(evidence, tokenOccurrenceIndex = null) {
      for (const dec of occurrenceDecisions) {
        if (dec.sessionId && dec.sessionId !== evidence.sessionId) continue;
        if (dec.recordId && dec.recordId !== evidence.recordId) continue;
        if (!dec.sessionId && !dec.recordId) continue;
        if (dec.role && dec.role !== evidence.role && normalizeRole(dec.role) !== evidence.role) continue;
        if (dec.raw && normalize(dec.raw) !== normalize(evidence.raw)) continue;
        if (dec.occurrenceIndex !== null && tokenOccurrenceIndex !== null && dec.occurrenceIndex !== tokenOccurrenceIndex) continue;
        return { id: dec.personId, decisionId: dec.id };
      }
      return null;
    },
    matchGlobal(raw) {
      const matches = globalAliases.get(normalize(raw));
      if (!matches || matches.length === 0) return null;
      const distinctPeople = [...new Set(matches.map(m => m.personId))];
      if (distinctPeople.length > 1) return { reason: 'ambiguous-alias', candidates: distinctPeople.sort() };
      return { id: matches[0].personId, decisionId: matches[0].id };
    }
  };
}
function compile(workbook, registry, {asOf,sourceHash,registryHash,compilerHash=null,sessionParserHash=null,splitMorningReport,aliases=null,aliasHash=null}) {
  if (!validDate(asOf)) throw new Error('An explicit valid --as-of YYYY-MM-DD is required');
  if (typeof splitMorningReport !== 'function') throw new Error('Session splitter is required');
  const index = identityIndex(registry), aliasIdx = buildAliasIndex(aliases, registry);
  const people = Object.create(null), unresolved = [], rows = [], exclusions = [];
  const appliedDecisionIds = new Set();
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
          for (let tIdx = 0; tIdx < tokens.length; tIdx++) {
            const raw = tokens[tIdx];
            tokenCount++; audit.tokens++;
            const evidence={...ref,field:segment.field,role:segment.role,raw};
            if(cancelled || /\b(?:STRIKE|cancelled|canceled)\b/i.test(raw)) {excludedTokens++; exclusions.push({...evidence,reason:'cancellation-or-strikethrough'});continue;}
            if(placeholder(raw)){placeholderTokens++;exclusions.push({...evidence,reason:'placeholder'});continue;}
            if(boundaryUnclear){unresolved.push({...evidence,reason:'unassigned-session-field',candidates:[]});continue;}
            if (conditional) {unresolved.push({...evidence,reason:'conditional-assignment',candidates:[]});continue;}

            let resolvedId = null;
            // 1. Accepted occurrence-specific decision
            const occMatch = aliasIdx?.matchOccurrence(evidence, tIdx);
            if (occMatch) {
              resolvedId = occMatch.id;
              appliedDecisionIds.add(occMatch.decisionId);
            } else {
              // 2. Accepted global alias
              const globMatch = aliasIdx?.matchGlobal(raw);
              if (globMatch) {
                if (!globMatch.id) {
                  unresolved.push({ ...evidence, ...globMatch });
                  continue;
                }
                resolvedId = globMatch.id;
                appliedDecisionIds.add(globMatch.decisionId);
              } else {
                // 3. Existing exact registry resolution
                const match = index.resolve(raw);
                if (!match.id) {
                  // 4. Unresolved
                  unresolved.push({ ...evidence, ...match });
                  continue;
                }
                resolvedId = match.id;
              }
            }

            resolvedTokens++;
            if(!people[resolvedId]) {const person=registry.identities.find(p=>p.id===resolvedId);people[resolvedId]={name:person.name,externalAccountId:null,entries:[]};}
            const person=people[resolvedId], entryId='assignment-'+hash(`${sourceHash}|${session.id}|${segment.role}|${resolvedId}`).slice(0,24);
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
  return {schemaVersion:1,asOf,sourceHash,registryHash,compilerHash,sessionParserHash,aliasHash:aliasHash||null,decisionIds:[...appliedDecisionIds].sort(),privacy:'PRIVATE_ADMIN_BACKFILL_NOT_A_PUBLIC_ASSET',identityContract:'Local canonical IDs require reviewed external account mapping. Assignments are not attendance.',audit:{sourceRows:rows.length,seriesRows:Object.fromEntries(['Morning Report','CPS Academy VMRs'].map(s=>[s,workbook[s].records.length])),sessions:sessionCount,tokenCount,resolvedTokens,duplicateTokens,unresolvedTokens,placeholderTokens,excludedTokens,uniqueAssignments:resolvedTokens-duplicateTokens},people,rows,unresolved,exclusions};
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
    console.log('Compile the private workbook assignment ledger offline.\nUsage: node scripts/compile-logbooks.cjs --as-of YYYY-MM-DD [--input workbook.json] [--identities data/logbook-identities.json] [--aliases data/member-aliases.json] [--output historical-contributions.candidate.json] [--replace]\nCandidates are generated to historical-contributions.candidate.json by default. Use scripts/diff-logbooks.cjs to inspect changes before explicit --replace. Assignments do not certify attendance.');
    return;
  }
  const options={};for(let i=0;i<args.length;i++){if(args[i]==='--replace'){options.replace=true;continue;}if(!['--as-of','--input','--identities','--aliases','--output'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw new Error(`Unknown or incomplete argument: ${args[i]}`);options[args[i].slice(2)]=args[++i];}
  const sourceRaw=fs.readFileSync(path.resolve(options.input||path.join(ROOT,'workbook.json')));
  const registryRaw=fs.readFileSync(path.resolve(options.identities||path.join(ROOT,'data/logbook-identities.json')));
  let aliases=null,aliasHash=null;
  const aliasesPath=options.aliases?path.resolve(options.aliases):null;
  if(aliasesPath){
    if(!fs.existsSync(aliasesPath))throw new Error(`Aliases file not found: ${aliasesPath}`);
    const raw=fs.readFileSync(aliasesPath);
    aliases=JSON.parse(raw);
    aliasHash=hash(raw);
  }
  const ledger=compile(JSON.parse(sourceRaw),JSON.parse(registryRaw),{asOf:options['as-of'],sourceHash:hash(sourceRaw),registryHash:hash(registryRaw),compilerHash:hash(fs.readFileSync(__filename)),sessionParserHash:hash(fs.readFileSync(path.join(ROOT,'session-core.js'))),splitMorningReport:require('../session-core.js').splitMorningReport,aliases,aliasHash});
  const defaultOutput=options.replace?'historical-contributions.json':'historical-contributions.candidate.json';
  const output=path.resolve(options.output||path.join(ROOT,defaultOutput));
  const protectedPaths=[options.input||path.join(ROOT,'workbook.json'),options.identities||path.join(ROOT,'data/logbook-identities.json'),aliasesPath,__filename,path.join(ROOT,'session-core.js')].filter(Boolean).map(p=>path.resolve(p).toLowerCase());
  if(protectedPaths.includes(output.toLowerCase()))throw new Error('Output must not overwrite a source, identity registry, aliases or compiler file');
  const isCandidate=path.basename(output).includes('candidate');
  const state=writeImmutable(output,JSON.stringify(ledger,null,2)+'\n',options.replace||isCandidate);
  console.log(JSON.stringify({state,output,audit:ledger.audit,aliasHash,appliedDecisions:ledger.decisionIds.length},null,2));
}
module.exports={compile,peopleTokens,extractRoles,identityIndex,buildAliasIndex,dateOf,writeImmutable,hash,normalize};
if(require.main===module){try{main(process.argv.slice(2));}catch(error){console.error(error.message);process.exitCode=1;}}
