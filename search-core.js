'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SearchCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const tabAliases = {
    'Morning Report': 'morning report mr vmr daily session',
    'CPS Academy VMRs': 'cps academy vmrs vmr archive session recording learning',
    'CRC': 'crc clinical reasoning case presenter mentor',
    'CRC - retired': 'crc retired mentorship archive legacy mentee mentor case presentation',
    'OrgStructure': 'orgstructure org structure org chart leadership teams',
    'Members': 'members orgstructure org structure directory sponsors country participants core team leaders inactive cohort',
    'Research @CPSolvers': 'research cpsolvers collaborators publications skills',
    'Podcast Episodes': 'podcast episodes audio editor release',
    'Schema review': 'schema review infographic video pipeline',
    'Conferences': 'conferences congress scholarship meeting',
    'Important links': 'important links resources bookmarks recurring',
    'Leader of the Week': 'leader of the week member',
    'Special VMRs': 'special vmrs vmr details',
    'Student Forum': 'student forum topic expert vmr',
    'Residency Programs': 'residency programs partner hospital discussants junior member facilitator allegheny'
  };

  const searchIndexCache = new Map();
  const MAX_SEARCH_CACHE_SIZE = 2000;

  function buildSearchIndex(r, t) {
    const editSig = r._editSig || '';
    const cacheKey = `${r.id || ''}::${t}::${editSig}::${r.source || ''}::${Object.values(r.fields || {}).join(' ')}`;
    if (searchIndexCache.has(cacheKey)) return searchIndexCache.get(cacheKey);
    if (r && r._search && !editSig) {
      if (searchIndexCache.size >= MAX_SEARCH_CACHE_SIZE) searchIndexCache.delete(searchIndexCache.keys().next().value);
      searchIndexCache.set(cacheKey, r._search);
      return r._search;
    }
    const res = `${t} ${r.source || ''} ${tabAliases[t] || ''} ${Object.values(r.fields || {}).join(' ')}`.toLowerCase();
    if (searchIndexCache.size >= MAX_SEARCH_CACHE_SIZE) searchIndexCache.delete(searchIndexCache.keys().next().value);
    searchIndexCache.set(cacheKey, res);
    return res;
  }

  function invalidateSearchRecord(id) {
    if (!id) return;
    const prefix = `${id}::`;
    for (const key of searchIndexCache.keys()) {
      if (key.startsWith(prefix)) searchIndexCache.delete(key);
    }
  }

  function clearSearchCache() {
    searchIndexCache.clear();
  }

  function extractSnippets(r, t, terms) {
    if (!terms || !terms.length) return [];
    const snippets = [];
    const usedFields = new Set();
    const TARGET_SNIPPET_LENGTH = 120;

    const entries = Object.entries(r.fields || {});

    for (const term of terms) {
      if (snippets.length >= 2) break;
      let matchedInField = false;

      for (const [fieldName, val] of entries) {
        if (snippets.length >= 2) break;
        if (usedFields.has(fieldName)) continue;
        const textVal = String(val ?? '');
        const lowerVal = textVal.toLowerCase();
        const matchIdx = lowerVal.indexOf(term);

        if (matchIdx !== -1) {
          matchedInField = true;
          usedFields.add(fieldName);

          const termLen = term.length;
          const radius = Math.max(0, Math.floor((TARGET_SNIPPET_LENGTH - termLen) / 2));
          const start = Math.max(0, matchIdx - radius);
          const end = Math.min(textVal.length, matchIdx + termLen + radius);

          const before = (start > 0 ? '…' : '') + textVal.slice(start, matchIdx);
          const match = textVal.slice(matchIdx, matchIdx + termLen);
          const after = textVal.slice(matchIdx + termLen, end) + (end < textVal.length ? '…' : '');

          snippets.push({
            type: 'field',
            fieldName,
            sourceText: textVal,
            range: [matchIdx, matchIdx + termLen],
            label: fieldName,
            before,
            match,
            after
          });
        }
      }

      if (!matchedInField) {
        const tabLower = (t || '').toLowerCase();
        const aliasLower = (tabAliases[t] || '').toLowerCase();
        const sourceLower = String(r.source || '').toLowerCase();

        if (tabLower.includes(term) || aliasLower.includes(term)) {
          if (!snippets.some(s => s.type === 'section')) {
            snippets.push({
              type: 'section',
              label: 'Matched section',
              isSectionAlias: true,
              tab: t,
              text: `Matched section: ${t}`
            });
          }
        } else if (sourceLower.includes(term)) {
          if (!snippets.some(s => s.type === 'source')) {
            snippets.push({
              type: 'source',
              label: 'Source',
              fieldName: 'Source',
              sourceText: r.source,
              range: [sourceLower.indexOf(term), sourceLower.indexOf(term) + term.length],
              before: '',
              match: r.source,
              after: ''
            });
          }
        }
      }
    }

    return snippets.slice(0, 2);
  }

  function searchRecord(r, t, queryOrTerms) {
    const terms = Array.isArray(queryOrTerms)
      ? queryOrTerms
      : String(queryOrTerms || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return null;

    const fullText = buildSearchIndex(r, t);
    const allMatch = terms.every(term => fullText.includes(term));
    if (!allMatch) return null;

    const snippets = extractSnippets(r, t, terms);
    return {
      matched: true,
      terms,
      snippets
    };
  }

  function createSnippetElement(snip) {
    const el = document.createElement('div');
    el.className = 'search-snippet';

    if (snip.label) {
      const label = document.createElement('strong');
      label.className = 'search-snippet-label';
      label.textContent = snip.label + ': ';
      el.appendChild(label);
    }

    if (snip.isSectionAlias) {
      el.appendChild(document.createTextNode(snip.text || `Matched section: ${snip.tab}`));
    } else {
      if (snip.before) el.appendChild(document.createTextNode(snip.before));
      const mark = document.createElement('mark');
      mark.className = 'search-match';
      mark.textContent = snip.match || '';
      el.appendChild(mark);
      if (snip.after) el.appendChild(document.createTextNode(snip.after));
    }
    return el;
  }

  return {
    tabAliases,
    buildSearchIndex,
    invalidateSearchRecord,
    clearSearchCache,
    searchRecord,
    extractSnippets,
    createSnippetElement
  };
});
