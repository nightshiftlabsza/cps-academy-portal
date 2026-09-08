'use strict';
const os = require('node:os');
const SessionCore = require('../session-core.js');
const SearchCore = require('../search-core.js');
const workbook = require('../workbook.json');

function benchmark() {
  const mrRecords = workbook['Morning Report'].records;
  const vmrRecords = workbook['CPS Academy VMRs'].records;
  const allRecords = [...mrRecords, ...vmrRecords];

  console.log('='.repeat(60));
  console.log('CPS ACADEMY PORTAL - RENDER PATH BENCHMARK');
  console.log('='.repeat(60));

  // 1. Environment & Dataset Summary
  const env = {
    nodeVersion: process.version,
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    memoryMb: Math.round(os.totalmem() / 1024 / 1024)
  };

  console.log('\n[Environment]');
  console.log(`Node.js: ${env.nodeVersion} (${env.platform} ${env.arch}) | CPUs: ${env.cpus} | System RAM: ${env.memoryMb} MB`);

  console.log('\n[Dataset]');
  console.log(`Morning Report rows: ${mrRecords.length}`);
  console.log(`CPS Academy VMR rows: ${vmrRecords.length}`);
  console.log(`Total benchmarked rows: ${allRecords.length}`);

  // 2. Cold Start Benchmark (Empty Cache)
  SessionCore.clearCaches();
  SearchCore.clearSearchCache();

  const coldStart = performance.now();
  let totalColdSessions = 0;
  for (const record of allRecords) {
    const sessions = SessionCore.splitMorningReport(record);
    totalColdSessions += sessions.length;
    for (const session of sessions) {
      SessionCore.parseSessionTime(session);
      SessionCore.formatSessionTime(session, 'America/New_York');
      SessionCore.facilitatorNames(session.fields?.Facilitator || '');
      SearchCore.buildSearchIndex(session, 'Morning Report');
    }
  }
  const coldDuration = performance.now() - coldStart;
  const coldStats = SessionCore.getCacheStats();

  console.log('\n[Cold Render Run]');
  console.log(`Duration: ${coldDuration.toFixed(2)} ms`);
  console.log(`Sessions processed: ${totalColdSessions}`);
  console.log(`Split cache calls: ${coldStats.splitCalls}, hits: ${coldStats.splitHits}`);
  console.log(`Facilitator calls: ${coldStats.facilitatorCalls}, hits: ${coldStats.facilitatorHits}`);

  // 3. Warm Render Benchmark (Filled Cache)
  const warmStart = performance.now();
  let totalWarmSessions = 0;
  for (const record of allRecords) {
    const sessions = SessionCore.splitMorningReport(record);
    totalWarmSessions += sessions.length;
    for (const session of sessions) {
      SessionCore.parseSessionTime(session);
      SessionCore.formatSessionTime(session, 'America/New_York');
      SessionCore.facilitatorNames(session.fields?.Facilitator || '');
      SearchCore.buildSearchIndex(session, 'Morning Report');
    }
  }
  const warmDuration = performance.now() - warmStart;
  const warmStats = SessionCore.getCacheStats();

  console.log('\n[Warm Render Run]');
  console.log(`Duration: ${warmDuration.toFixed(2)} ms`);
  console.log(`Speedup factor: ${(coldDuration / Math.max(0.01, warmDuration)).toFixed(1)}x faster`);
  console.log(`Split cache hits: ${warmStats.splitHits} / ${warmStats.splitCalls} (${((warmStats.splitHits / warmStats.splitCalls) * 100).toFixed(1)}%)`);
  console.log(`Facilitator cache hits: ${warmStats.facilitatorHits} / ${warmStats.facilitatorCalls} (${((warmStats.facilitatorHits / warmStats.facilitatorCalls) * 100).toFixed(1)}%)`);

  // 4. Single-Record Edit Invalidation Run
  const targetId = mrRecords[0].id;
  SessionCore.invalidateRecord(targetId);
  SearchCore.invalidateSearchRecord(targetId);

  const editStart = performance.now();
  for (const record of allRecords) {
    const sessions = SessionCore.splitMorningReport(record);
    for (const session of sessions) {
      SessionCore.parseSessionTime(session);
      SessionCore.formatSessionTime(session, 'America/New_York');
      SessionCore.facilitatorNames(session.fields?.Facilitator || '');
      SearchCore.buildSearchIndex(session, 'Morning Report');
    }
  }
  const editDuration = performance.now() - editStart;

  console.log('\n[Single-Record Edit-to-Render Run]');
  console.log(`Duration after 1 record invalidation: ${editDuration.toFixed(2)} ms`);

  // 5. Memory Boundedness Verification
  console.log('\n[Cache Sizes]');
  console.log(`Split cache size: ${warmStats.splitSize} / 4000 max`);
  console.log(`Time resolution cache size: ${warmStats.timeResolutionSize} / 4000 max`);
  console.log(`Time format cache size: ${warmStats.timeFormatSize} / 4000 max`);
  console.log(`Facilitator cache size: ${warmStats.facilitatorSize} / 4000 max`);
  console.log('='.repeat(60));

  return {
    env,
    records: allRecords.length,
    sessions: totalColdSessions,
    coldDurationMs: coldDuration,
    warmDurationMs: warmDuration,
    speedup: coldDuration / Math.max(0.01, warmDuration),
    editDurationMs: editDuration,
    cacheStats: warmStats
  };
}

if (require.main === module) {
  benchmark();
}

module.exports = { benchmark };
