'use strict';

/**
 * CPS Academy Portal - Export Personal Logbook Slice CLI
 *
 * Extracts a single person's historical assignment records and provenance
 * from the compiled ledger for local logbook preview.
 *
 * Usage:
 *   node scripts/export-personal-logbook.cjs --person-id <canonical-id> --output <private-file>
 */
const fs = require('node:fs');
const path = require('node:path');

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--person-id' && i + 1 < args.length) {
      options.personId = args[++i];
    } else if (args[i] === '--output' && i + 1 < args.length) {
      options.output = args[++i];
    } else if (args[i] === '--ledger' && i + 1 < args.length) {
      options.ledger = args[++i];
    }
  }
  return options;
}

function exportPersonalLogbook({ personId, output, ledger }) {
  if (!personId) {
    throw new Error('Missing required argument: --person-id <canonical-id>');
  }
  if (!output) {
    throw new Error('Missing required argument: --output <private-file>');
  }

  const root = path.resolve(__dirname, '..');
  const ledgerPath = ledger ? path.resolve(ledger) : path.join(root, 'historical-contributions.json');

  if (!fs.existsSync(ledgerPath)) {
    throw new Error(`Ledger file not found at ${ledgerPath}`);
  }

  const ledgerData = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  const person = ledgerData.people?.[personId];

  if (!person) {
    throw new Error(`Person ID "${personId}" not found in ledger.`);
  }

  const slice = {
    schemaVersion: 1,
    personId,
    canonicalName: person.name,
    provenance: {
      asOf: ledgerData.asOf,
      sourceHash: ledgerData.sourceHash,
      registryHash: ledgerData.registryHash,
      compilerHash: ledgerData.compilerHash,
      exportedAt: new Date().toISOString()
    },
    entries: person.entries || []
  };

  const outputPath = path.resolve(output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(slice, null, 2), 'utf8');

  return { slice, outputPath };
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = exportPersonalLogbook(options);
    console.log(`Exported ${result.slice.entries.length} entries for ${result.slice.canonicalName} (${result.slice.personId}) to ${result.outputPath}`);
  } catch (err) {
    console.error('Export failed:', err.message);
    process.exitCode = 1;
  }
}

module.exports = { exportPersonalLogbook, parseArgs };
