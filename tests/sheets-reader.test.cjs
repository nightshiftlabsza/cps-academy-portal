'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeDate,
  parseMorningReport,
  parseVMRs,
  parseOrgStructure,
  parseImportantLinks
} = require('../api/_lib/sheets-reader.cjs');

test('normalizeDate parses diverse date inputs into ISO YYYY-MM-DD', () => {
  assert.equal(normalizeDate('2026-10-31'), '2026-10-31');
  assert.equal(normalizeDate('Thursday - December 31, 2026'), '2026-12-31');
  assert.equal(normalizeDate('October 4, 2026'), '2026-10-04');
  assert.equal(normalizeDate(''), '');
  assert.equal(normalizeDate('TBD'), 'TBD');
});

test('parseMorningReport builds valid column schema and records from row 7 onwards', () => {
  const sampleRows = [
    ['', '', '', '', '', 'Header 1'],
    [],
    [],
    ['', 'Time', '', 'Type', '', 'Facilitator'],
    ['', 'PST', 'EST', '', 'Notes banner'],
    ['Date', 'Pacific', 'Eastern', 'Type', '', 'Facilitator'], // Row 6
    ['2026-10-31', '6:00 AM', '9:00 AM', 'Spontaneous', '', 'Rabih', 'Presenter Jane'] // Row 7
  ];

  const result = parseMorningReport(sampleRows);
  assert.ok(Array.isArray(result.columns));
  assert.equal(result.columns[0], 'Date');
  assert.equal(result.columns[4], 'Facilitator');
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].id, 'Morning Report:7');
  assert.equal(result.records[0].fields['Date'], '2026-10-31');
  assert.equal(result.records[0].fields['Facilitator'], 'Rabih');
});

test('parseVMRs extracts session records with valid links and tags', () => {
  const sampleRows = [
    ['Facilitator', 'Title', 'Topic'],
    ['Header row 2'],
    ['Header row 3'],
    ['Rabih', 'Test Session', 'Cardiology', 'Wed 11am', 'Zoom link', 'https://youtu.be/12345', 'No', 'Bonus note']
  ];

  const result = parseVMRs(sampleRows);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].id, 'CPS Academy VMRs:4');
  assert.equal(result.records[0].fields['Session title'], 'Test Session');
  assert.equal(result.records[0].links['Recording'], 'https://youtu.be/12345');
});

test('parseOrgStructure splits into OrgStructure teams and Members directory at row 56', () => {
  const sampleRows = Array(60).fill(null).map(() => []);
  sampleRows[2] = ['Leadership Team', 'Alice, Bob', 'Co-Chairs']; // Row 3
  sampleRows[55] = ['Name', 'Sponsor', 'Social', 'Country', 'Birthday', 'Email', 'Location', 'Subspecialty']; // Row 56 header
  sampleRows[56] = ['Dr. John Doe', 'Alice', '@johndoe', 'USA', '01-01', 'john@example.com', 'Boston', 'IM']; // Row 57

  const result = parseOrgStructure(sampleRows);
  assert.ok(result.OrgStructure.records.length >= 1);
  assert.equal(result.OrgStructure.records[0].id, 'OrgStructure:3');
  assert.equal(result.OrgStructure.records[0].fields['Team / responsibility'], 'Leadership Team');

  assert.equal(result.Members.records.length, 1);
  assert.equal(result.Members.records[0].id, 'Members:57');
  assert.equal(result.Members.records[0].fields['Name'], 'Dr. John Doe');
  assert.equal(result.Members.records[0].fields['Email'], 'john@example.com');
});

test('parseImportantLinks handles resource URLs cleanly', () => {
  const sampleRows = [
    ['Resource', 'Link'],
    ['VMR Guide', 'https://docs.google.com/document/d/1234']
  ];

  const result = parseImportantLinks(sampleRows);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].id, 'Important links:2');
  assert.equal(result.records[0].fields['Resource'], 'VMR Guide');
  assert.equal(result.records[0].links['Link'], 'https://docs.google.com/document/d/1234');
});
