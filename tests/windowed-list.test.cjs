'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const WindowedList = require('../windowed-list.js');

test('Window calculation computes correct start, end, and spacer heights', () => {
  const totalItems = 100;
  const itemHeight = 40;
  const containerHeight = 400; // fits 10 items
  const overscan = 3;

  // At top (scrollTop = 0)
  const topWin = WindowedList.computeWindow({
    totalItems,
    itemHeight,
    containerHeight,
    scrollTop: 0,
    overscan
  });

  assert.equal(topWin.startIndex, 0);
  assert.equal(topWin.endIndex, 10 + overscan); // 13
  assert.equal(topWin.topSpacerHeight, 0);
  assert.equal(topWin.bottomSpacerHeight, (100 - 13) * 40);
  assert.equal(topWin.visibleCount, 13);

  // Scrolled to middle: scrollTop = 1200 (item 30)
  const midWin = WindowedList.computeWindow({
    totalItems,
    itemHeight,
    containerHeight,
    scrollTop: 1200,
    overscan
  });

  assert.equal(midWin.startIndex, 30 - 3); // 27
  assert.equal(midWin.endIndex, 30 + 10 + 3); // 43
  assert.equal(midWin.topSpacerHeight, 27 * 40);
  assert.equal(midWin.bottomSpacerHeight, (100 - 43) * 40);
  assert.equal(midWin.visibleCount, 16);
});

test('Reachable last record without index overflow or missing items', () => {
  const totalItems = 500;
  const itemHeight = 50;
  const containerHeight = 500; // fits 10 items
  const maxScroll = totalItems * itemHeight - containerHeight; // 24,500

  const bottomWin = WindowedList.computeWindow({
    totalItems,
    itemHeight,
    containerHeight,
    scrollTop: maxScroll,
    overscan: 5
  });

  assert.equal(bottomWin.endIndex, totalItems);
  assert.ok(bottomWin.startIndex > 480);
  assert.equal(bottomWin.bottomSpacerHeight, 0, 'Bottom spacer should be 0 when scrolled to bottom');
  assert.ok(bottomWin.topSpacerHeight > 0);
});

test('Zero or negative items produce safe empty window', () => {
  const empty = WindowedList.computeWindow({
    totalItems: 0,
    itemHeight: 40,
    containerHeight: 400,
    scrollTop: 0
  });

  assert.equal(empty.startIndex, 0);
  assert.equal(empty.endIndex, 0);
  assert.equal(empty.topSpacerHeight, 0);
  assert.equal(empty.bottomSpacerHeight, 0);
  assert.equal(empty.visibleCount, 0);
});

test('defaultSpacer creates valid transparent table spacer row', () => {
  const spacer = WindowedList.defaultSpacer(120, 'top', 7);
  assert.match(spacer, /<tr class="matrix-spacer-row spacer-top"/);
  assert.match(spacer, /colspan="7"/);
  assert.match(spacer, /height:120px/);

  const zeroSpacer = WindowedList.defaultSpacer(0, 'top', 7);
  assert.equal(zeroSpacer, '');
});

test('attach controller mounts window, preserves focus, and supports toggleShowAll', () => {
  // Synthetic DOM container
  const items = Array.from({ length: 200 }, (_, i) => ({ id: `row-${i}`, title: `Row ${i}` }));
  let innerHTML = '';
  let activeElement = null;

  const mockTbody = {
    get innerHTML() { return innerHTML; },
    set innerHTML(val) { innerHTML = val; }
  };

  const mockContainer = {
    scrollTop: 0,
    clientHeight: 400,
    querySelector: (sel) => (sel === 'tbody' ? mockTbody : null),
    contains: (el) => el && el.parentElement === mockContainer,
    addEventListener: () => {},
    removeEventListener: () => {},
    ownerDocument: {
      get activeElement() { return activeElement; }
    }
  };

  let renderedRange = null;

  const controller = WindowedList.attach(mockContainer, {
    items,
    itemHeight: 40,
    overscan: 2,
    colspan: 4,
    tbodySelector: 'tbody',
    renderRow: (item, idx) => `<tr data-index="${idx}" class="row-${item.id}"><td>${item.title}</td></tr>`,
    onWindowChange: (range) => { renderedRange = range; }
  });

  assert.ok(controller);
  assert.equal(controller.isExpanded(), false);
  assert.ok(renderedRange);
  assert.equal(renderedRange.startIndex, 0);
  assert.ok(renderedRange.endIndex <= 20);
  assert.match(mockTbody.innerHTML, /spacer-bottom/);

  // Toggle show all
  controller.toggleShowAll();
  assert.equal(controller.isExpanded(), true);
  assert.equal(renderedRange.startIndex, 0);
  assert.equal(renderedRange.endIndex, 200);
  assert.doesNotMatch(mockTbody.innerHTML, /spacer-bottom/);

  // Toggle back
  controller.toggleShowAll();
  assert.equal(controller.isExpanded(), false);
  assert.ok(renderedRange.endIndex < 200);

  // Focus retention: simulate an activeElement at row 150
  mockContainer.scrollTop = 0; // scrolled to top
  activeElement = {
    parentElement: mockContainer,
    closest: (sel) => ({ dataset: { index: '150' } })
  };

  controller.update();
  // Row 150 must be included in the rendered window despite scrollTop = 0!
  assert.ok(renderedRange.endIndex >= 151, `End index (${renderedRange.endIndex}) must encompass focused row 150`);

  controller.destroy();
});
