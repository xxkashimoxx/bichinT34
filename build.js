const fs=require('node:fs');
const path=require('node:path');
const out=path.join(__dirname,'public');
fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(out,{recursive:true});
for(const name of ['styles.css','app.js','seed.json'])fs.copyFileSync(path.join(__dirname,name),path.join(out,name));
const index=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
// Use Vercel as a same-origin proxy to Supabase. This avoids browser CORS and
// content blockers that reject direct requests to *.supabase.co.
const config=`<script>window.NINHO_API_BASE='/ninho-api/api';window.NINHO_SUPABASE_KEY='sb_publishable_4fW6jRFGxWS9iZEXE0cwWQ_RDtEwdGf';</script>`;
fs.writeFileSync(path.join(out,'index.html'),index.replace('<script src="/app.js"></script>',`${config}<script src="/app.js"></script>`));
const assets=path.join(out,'assets');
fs.mkdirSync(assets,{recursive:true});
fs.writeFileSync(path.join(assets,'convite-anya.webp'),Buffer.from(fs.readFileSync(path.join(__dirname,'assets','convite-anya.webp.b64'),'utf8').trim(),'base64'));
fs.writeFileSync(path.join(assets,'logo-cegonha.webp'),Buffer.from(fs.readFileSync(path.join(__dirname,'assets','logo-cegonha.webp.b64'),'utf8').trim(),'base64'));
console.log('Lá vem cegonha site built in public/.');
