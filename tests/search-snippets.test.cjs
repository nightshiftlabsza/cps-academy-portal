'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const SearchCore = require('../search-core.js');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'workbook.json'), 'utf8'));

test('A match found only in a hidden note produces a visible labelled snippet', () => {
  // Create a record where the query appears ONLY in a Note or Remarks field
  const record = {
    id: 'test-note-1',
    fields: {
      Title: 'General Clinical Review',
      Presenter: 'Alice Smith',
      Notes: 'Confidential clinical discussion regarding unusual rash etiology and dermatology follow-up.'
    }
  };

  const res = SearchCore.searchRecord(record, 'Morning Report', 'rash');
  assert.ok(res, 'Record should match');
  assert.equal(res.snippets.length, 1);
  const snip = res.snippets[0];
  assert.equal(snip.fieldName, 'Notes');
  assert.equal(snip.label, 'Notes');
  assert.equal(snip.match.toLowerCase(), 'rash');
  assert.ok(snip.before.includes('unusual'));
  assert.ok(snip.after.includes('etiology'));
});

test('Email matches highlight the actual matching text', () => {
  const record = {
    id: 'test-email-1',
    fields: {
      Name: 'Carlos Gomez',
      Role: 'Editor',
      Email: 'carlos.gomez@cpsolvers-academy.org'
    }
  };

  const res = SearchCore.searchRecord(record, 'Members', 'cpsolvers-academy');
  assert.ok(res, 'Record should match email');
  assert.equal(res.snippets.length, 1);
  const snip = res.snippets[0];
  assert.equal(snip.fieldName, 'Email');
  assert.equal(snip.match, 'cpsolvers-academy');
  assert.ok(snip.before.includes('carlos.gomez@'));
  assert.ok(snip.after.includes('.org'));
  assert.deepEqual(snip.range, [13, 30]);
});

test('<script> and HTML-like source values render literally', () => {
  const record = {
    id: 'test-xss-1',
    fields: {
      Title: '<script>alert("XSS")</script>',
      Comments: 'Payload <b>dangerous</b> injection'
    }
  };

  const res = SearchCore.searchRecord(record, 'Morning Report', 'alert');
  assert.ok(res, 'Match found');
  const snip = res.snippets[0];
  assert.equal(snip.match, 'alert');
  assert.equal(snip.before, '<script>');
  assert.equal(snip.after, '("XSS")</script>');

  // Test DOM rendering behavior with mocked document
  const mockElements = [];
  const mockTextNodes = [];
  const globalDoc = global.document;
  global.document = {
    createElement(tag) {
      const el = { tag, children: [], textContent: '', className: '', appendChild(c) { this.children.push(c); } };
      mockElements.push(el);
      return el;
    },
    createTextNode(text) {
      const tn = { nodeType: 3, text };
      mockTextNodes.push(tn);
      return tn;
    }
  };

  try {
    const el = SearchCore.createSnippetElement(snip);
    assert.equal(el.tag, 'div');
    // Ensure no HTML parsing/innerHTML was used; text node holds the raw script tag
    assert.ok(mockTextNodes.some(tn => tn.text === '<script>'));
    assert.ok(mockElements.some(e => e.tag === 'mark' && e.textContent === 'alert'));
  } finally {
    global.document = globalDoc;
  }
});

test('Multiple search terms retain existing matching behavior', () => {
  const record = {
    id: 'test-multi-1',
    fields: {
      Facilitator: 'Reza Manesh',
      Topic: 'Cardiology chest pain differential',
      Type: 'Morning Report'
    }
  };

  // Both terms match -> succeeds
  const matchBoth = SearchCore.searchRecord(record, 'Morning Report', ['reza', 'cardiology']);
  assert.ok(matchBoth, 'AND semantics: should match when both terms present');
  assert.equal(matchBoth.snippets.length, 2, 'Produces snippets for distinct matched fields');
  assert.equal(matchBoth.snippets[0].fieldName, 'Facilitator');
  assert.equal(matchBoth.snippets[1].fieldName, 'Topic');

  // One term does not match -> returns null
  const failOne = SearchCore.searchRecord(record, 'Morning Report', ['reza', 'neurology']);
  assert.equal(failOne, null, 'AND semantics: must fail when any term is absent');
});

test('Results beyond page one retain correct snippets', () => {
  // Search for 'vmr' across all workbook records, replicating pagination
  const terms = ['vmr'];
  const allMatches = Object.keys(data).flatMap(t =>
    data[t].records.map(r => SearchCore.searchRecord(r, t, terms)).filter(Boolean)
  );

  assert.ok(allMatches.length > 30, 'Should have multiple pages of results');
  const PAGE_SIZE = 24;
  const page2Matches = allMatches.slice(PAGE_SIZE, PAGE_SIZE + PAGE_SIZE);

  assert.ok(page2Matches.length > 0, 'Page 2 has records');
  for (const match of page2Matches) {
    assert.ok(match.snippets.length > 0, 'Every page 2 match retains at least one snippet');
    for (const snip of match.snippets) {
      if (snip.isSectionAlias) {
        assert.ok(snip.text.startsWith('Matched section:'));
      } else {
        assert.ok(snip.match.toLowerCase().includes('vmr'));
        assert.ok(snip.sourceText.length >= snip.match.length);
      }
    }
  }
});

test('Section aliases produce truthful explanations', () => {
  // Search for 'mentor' on a CRC record where 'mentor' is in tabAliases but not in the record fields
  const record = {
    id: 'crc-test-1',
    fields: {
      Presenter: 'Test Presenter',
      Status: 'Active'
    }
  };

  const res = SearchCore.searchRecord(record, 'CRC', 'mentor');
  assert.ok(res, 'Record matches via CRC tab alias');
  assert.equal(res.snippets.length, 1);
  const snip = res.snippets[0];
  assert.equal(snip.isSectionAlias, true);
  assert.equal(snip.label, 'Matched section');
  assert.equal(snip.text, 'Matched section: CRC');
});
