'use strict';

/**
 * CPS Academy Portal - Windowed List Module
 *
 * Lightweight, zero-dependency virtual scrolling helper for large tables and lists.
 * Binds DOM footprints to visible rows + overscan, preserves table layout semantics
 * with transparent spacer rows, preserves active keyboard focus, and supports
 * a "Show all" toggle for browser in-page search (Ctrl+F).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WindowedList = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function computeWindow({ totalItems, itemHeight, containerHeight, scrollTop, overscan = 5 }) {
    if (!totalItems || totalItems <= 0) {
      return { startIndex: 0, endIndex: 0, topSpacerHeight: 0, bottomSpacerHeight: 0, visibleCount: 0 };
    }
    const safeHeight = Math.max(1, itemHeight || 44);
    const safeContainer = Math.max(50, containerHeight || 600);
    const safeScroll = Math.max(0, scrollTop || 0);

    const rawStart = Math.floor(safeScroll / safeHeight);
    const visibleCapacity = Math.ceil(safeContainer / safeHeight);
    const rawEnd = rawStart + visibleCapacity;

    const startIndex = Math.max(0, rawStart - overscan);
    const endIndex = Math.min(totalItems, rawEnd + overscan);

    const topSpacerHeight = startIndex * safeHeight;
    const bottomSpacerHeight = Math.max(0, (totalItems - endIndex) * safeHeight);

    return {
      startIndex,
      endIndex,
      topSpacerHeight,
      bottomSpacerHeight,
      visibleCount: endIndex - startIndex
    };
  }

  function defaultSpacer(height, position, colspan = 7) {
    if (!height || height <= 0) return '';
    return `<tr class="matrix-spacer-row spacer-${position}" aria-hidden="true" style="height:${height}px;border:none;"><td colspan="${colspan}" style="height:${height}px;padding:0;border:none;pointer-events:none;background:transparent;"></td></tr>`;
  }

  function attach(container, options = {}) {
    if (!container) return null;

    const {
      items = [],
      itemHeight = 44,
      overscan = 5,
      colspan = 7,
      tbodySelector = 'tbody',
      renderRow,
      renderSpacer = defaultSpacer,
      onWindowChange = null,
      showAll = false
    } = options;

    let isExpanded = Boolean(showAll);
    let rafId = null;
    let currentStart = 0;
    let currentEnd = items.length;

    const scrollEl = options.scrollElement || container;
    const tbody = container.querySelector(tbodySelector) || container;

    function renderRange(start, end, topHeight, bottomHeight) {
      currentStart = start;
      currentEnd = end;

      if (!renderRow) return;

      const topSpacerHtml = topHeight > 0 ? renderSpacer(topHeight, 'top', colspan) : '';
      const bottomSpacerHtml = bottomHeight > 0 ? renderSpacer(bottomHeight, 'bottom', colspan) : '';

      const rowsHtml = [];
      for (let i = start; i < end; i++) {
        rowsHtml.push(renderRow(items[i], i));
      }

      tbody.innerHTML = topSpacerHtml + rowsHtml.join('') + bottomSpacerHtml;

      if (typeof onWindowChange === 'function') {
        onWindowChange({ startIndex: start, endIndex: end, total: items.length, isExpanded });
      }
    }

    function update() {
      if (isExpanded || items.length <= (options.threshold || 40)) {
        renderRange(0, items.length, 0, 0);
        return;
      }

      const containerHeight = scrollEl.clientHeight || 600;
      const scrollTop = scrollEl.scrollTop || 0;

      const win = computeWindow({
        totalItems: items.length,
        itemHeight,
        containerHeight,
        scrollTop,
        overscan
      });

      // Focus preservation: check if activeElement is inside a rendered row
      const doc = container.ownerDocument || (typeof document !== 'undefined' ? document : null);
      const activeEl = doc?.activeElement;
      if (activeEl && container.contains(activeEl)) {
        const rowEl = activeEl.closest('[data-index]');
        if (rowEl) {
          const activeIdx = parseInt(rowEl.dataset.index, 10);
          if (!Number.isNaN(activeIdx)) {
            if (activeIdx < win.startIndex) {
              const diff = win.startIndex - activeIdx;
              win.startIndex = activeIdx;
              win.topSpacerHeight = Math.max(0, win.topSpacerHeight - diff * itemHeight);
            } else if (activeIdx >= win.endIndex) {
              const diff = activeIdx - win.endIndex + 1;
              win.endIndex = Math.min(items.length, activeIdx + 1);
              win.bottomSpacerHeight = Math.max(0, win.bottomSpacerHeight - diff * itemHeight);
            }
          }
        }
      }

      renderRange(win.startIndex, win.endIndex, win.topSpacerHeight, win.bottomSpacerHeight);
    }

    function onScroll() {
      if (isExpanded) return;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(update);
    }

    scrollEl.addEventListener('scroll', onScroll, { passive: true });

    function toggleShowAll(force) {
      isExpanded = typeof force === 'boolean' ? force : !isExpanded;
      update();
      return isExpanded;
    }

    function destroy() {
      if (rafId) cancelAnimationFrame(rafId);
      scrollEl.removeEventListener('scroll', onScroll);
    }

    // Initial render
    update();

    return {
      update,
      toggleShowAll,
      isExpanded: () => isExpanded,
      destroy,
      getRange: () => ({ start: currentStart, end: currentEnd })
    };
  }

  return {
    computeWindow,
    defaultSpacer,
    attach
  };
});
