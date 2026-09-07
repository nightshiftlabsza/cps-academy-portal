const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
fs.mkdirSync(dist,{recursive:true});
for(const file of ['index.html','styles.css','session-core.js','app.js','workbook.json'])fs.copyFileSync(path.join(root,file),path.join(dist,file));
console.log('Built five static assets in dist/. Build does not deploy or change access. The historical ledger remains private and is not bundled.');
