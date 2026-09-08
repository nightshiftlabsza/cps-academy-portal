'use strict';

/**
 * CPS Academy Portal - Personal Assignment Logbook Module
 *
 * Provides clinical procedure logbook metrics and verification for a single
 * authenticated CPS Academy member.
 * Zero gamification, zero streaks, zero rankings, zero inferred attendance.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Logbook = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  let inMemorySlice = null;

  function clearPersonalSlice() {
    inMemorySlice = null;
  }

  function getPersonalSlice() {
    return inMemorySlice;
  }

  function setPersonalSlice(slice) {
    inMemorySlice = slice;
  }

  function isValidIsoDate(str) {
    if (!str || typeof str !== 'string') return false;
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;
    const d = new Date(str + 'T12:00:00Z');
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str;
  }

  function validateSlice(slice, expectedPersonId) {
    if (!slice || typeof slice !== 'object') {
      return { valid: false, error: 'Logbook slice must be an object' };
    }
    if (slice.schemaVersion !== 1) {
      return { valid: false, error: 'Unsupported schema version' };
    }
    if (!slice.personId || typeof slice.personId !== 'string') {
      return { valid: false, error: 'Missing personId in logbook slice' };
    }
    if (!expectedPersonId) {
      return { valid: false, error: 'Unknown or unmapped identity cannot display a slice' };
    }
    if (slice.personId !== expectedPersonId) {
      return { valid: false, error: `Identity mismatch: slice is for ${slice.personId}, expected ${expectedPersonId}` };
    }
    if (!Array.isArray(slice.entries)) {
      return { valid: false, error: 'Slice entries must be an array' };
    }
    return { valid: true };
  }

  function processLogbook(slice, options = {}) {
    const refDate = options.referenceDate || new Date().toISOString().slice(0, 10);
    const entries = Array.isArray(slice?.entries) ? slice.entries : [];

    const pastEntries = [];
    const scheduledEntries = [];
    const unresolvedEntries = [];

    for (const entry of entries) {
      const dateStr = entry.date;
      if (!isValidIsoDate(dateStr)) {
        unresolvedEntries.push(entry);
        continue;
      }
      // Future assignments are excluded from past-assignment totals
      if (entry.temporalState === 'scheduled' || dateStr > refDate) {
        scheduledEntries.push(entry);
      } else {
        pastEntries.push(entry);
      }
    }

    // Sort past assignments reverse-chronological (newest first)
    pastEntries.sort((a, b) => b.date.localeCompare(a.date));
    scheduledEntries.sort((a, b) => a.date.localeCompare(b.date));

    // Recorded assignments total: count of past valid assignments
    const recordedAssignments = pastEntries.length;

    // Distinct sessions: count of unique sessionIds in past assignments
    // One person holding two roles in one session is two assignments but one session
    const distinctSessionIds = new Set();
    const roleBreakdown = {};

    for (const entry of pastEntries) {
      if (entry.sessionId) {
        distinctSessionIds.add(entry.sessionId);
      } else {
        distinctSessionIds.add(entry.id);
      }
      const role = entry.role || 'Unspecified';
      roleBreakdown[role] = (roleBreakdown[role] || 0) + 1;
    }

    return {
      personId: slice.personId,
      canonicalName: slice.canonicalName,
      provenance: slice.provenance || {},
      metrics: {
        recordedAssignments,
        distinctSessions: distinctSessionIds.size,
        roleBreakdown
      },
      pastEntries,
      scheduledEntries,
      unresolvedEntries
    };
  }

  return {
    clearPersonalSlice,
    getPersonalSlice,
    setPersonalSlice,
    validateSlice,
    processLogbook,
    isValidIsoDate
  };
});
