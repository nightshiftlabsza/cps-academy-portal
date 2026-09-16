const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
if (fs.existsSync(dist)) fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist,{recursive:true});
for(const file of ['index.html','styles.css','session-core.js','search-core.js','identity.js','offline.js','logbook.js','windowed-list.js','app.js','workbook.json','sw.js']) {
  if (file === 'workbook.json') {
    // Redact sensitive private fields from public build output
    const raw = fs.readFileSync(path.join(root, file), 'utf8');
    const wb = JSON.parse(raw);
    if (wb.Members && Array.isArray(wb.Members.records)) {
      wb.Members.records = wb.Members.records.map(rec => ({
        ...rec,
        fields: {
          ...rec.fields,
          Birthday: rec.fields?.Birthday ? 'Redacted' : ''
        }
      }));
    }
    fs.writeFileSync(path.join(dist, file), JSON.stringify(wb));
  } else {
    fs.copyFileSync(path.join(root, file), path.join(dist, file));
  }
}
console.log('Built eleven static assets in dist/. Private data (birthdays) redacted from build snapshot. Historical ledger remains excluded.');
