const fs=require('node:fs');
const path=require('node:path');
const out=path.join(__dirname,'public');
fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(out,{recursive:true});
for(const name of ['index.html','styles.css','app.js','seed.json'])fs.copyFileSync(path.join(__dirname,name),path.join(out,name));
console.log('Static Ninho preview built in public/.');
