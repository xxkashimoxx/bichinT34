const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

const ROOT=__dirname, DATA_DIR=process.env.NINHO_DATA_DIR||path.join(ROOT,'data'), DB=path.join(DATA_DIR,'ninho.json');
const PORT=Number(process.env.PORT)||4173;
const HOST=process.env.HOST||'127.0.0.1';
const catalog=[
 [1,'Roupinhas','♧',[['Body manga curta','6'],['Body manga longa','6'],['Calça/mijão','6'],['Macacão','6'],['Casaquinho','2'],['Meias','4 pares'],['Touca','2'],['Roupa para sair','2']]],
 [1,'Sono','☾',[['Berço/mini berço','1'],['Colchão firme adequado','1'],['Lençol com elástico','3'],['Manta leve','2'],['Cueiro','2–3']]],
 [1,'Banho e higiene','♨',[['Banheira simples','1'],['Toalha com capuz','2–3'],['Toalha fralda','2'],['Trocador','1'],['Fralda de boca','6'],['Fralda de ombro','3'],['Sabonete líquido infantil','1'],['Escova/pente','1'],['Cortador/lixa de unha','1'],['Termômetro','1'],['Algodão','1 pacote'],['Pomada para assadura','1']]],
 [1,'Fraldas','▱',[['Fralda P','2–3 pacotes']]],
 [1,'Passeio e segurança','⌂',[['Bebê-conforto/cadeirinha adequada','1'],['Carrinho','1']]],
 [2,'Fraldas','▱',[['Fralda RN','1 pacote'],['Fralda M','2–3 pacotes'],['Trocador descartável','1 pacote']]],
 [2,'Amamentação','♡',[['Sutiã de amamentação','2–3'],['Absorvente para seios','1 pacote'],['Almofada de amamentação','1'],['Paninhos de boca','6']]],
 [2,'Passeio e organização','⌂',[['Bolsa/mochila maternidade','1'],['Trocador portátil','1'],['Manta extra','1'],['Cesto de roupa suja','1'],['Cabides','6–10'],['Organizadores simples','2–4']]],
 [2,'Brinquedos','✿',[['Chocalho','1'],['Mordedor','1'],['Livro de tecido/alto contraste','1']]],
 [3,'Extras','✧',[['Saco de dormir','1–2'],['Roupa especial','1'],['Bomba tira-leite','1'],['Potes para leite','2–4'],['Mamadeiras','0–2'],['Chupetas','Somente se optar'],['Tapete de atividades','1, mais adiante'],['Móbile','1'],['Mais roupas P/M','Conforme crescimento']]]
];
function slug(s){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')}
function seed(){let n=0;return {event:{baby:'Anya',date:'',time:'',address:'',message:'Venha celebrar conosco!',mapUrl:'',giftUrl:'',photosUrl:'',musicUrl:''},guests:[],checklist:catalog.flatMap(([priority,category,icon,items])=>items.map(([name,quantity])=>({id:`${priority}-${slug(category)}-${slug(name)}-${++n}`,priority,category,icon,name,quantity,status:''})))}}
fs.mkdirSync(DATA_DIR,{recursive:true});
let db;try{db=JSON.parse(fs.readFileSync(DB,'utf8'))}catch{db=seed();writeDb()}
function writeDb(){const temp=DB+'.tmp';fs.writeFileSync(temp,JSON.stringify(db,null,2));fs.renameSync(temp,DB)}
function send(res,code,data){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))}
function error(res,code,message){send(res,code,{error:message})}
function body(req){return new Promise((resolve,reject)=>{let s='';req.on('data',chunk=>{s+=chunk;if(s.length>100_000){reject(Error('Corpo da requisição muito grande'));req.destroy()}});req.on('end',()=>{try{resolve(s?JSON.parse(s):{})}catch{reject(Error('JSON inválido'))}});req.on('error',reject)})}
function clean(s,max){return typeof s==='string'?s.trim().slice(0,max):''}
function staticFile(res,file){const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg'};fs.readFile(file,(err,data)=>{if(err)return error(res,404,'Arquivo não encontrado');res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data)})}
const server=http.createServer(async(req,res)=>{
 let url;try{url=new URL(req.url,'http://localhost')}catch{return error(res,400,'URL inválida')}
 const p=url.pathname;
 if(req.method==='GET'&&p==='/api/data')return send(res,200,db);
 if(req.method==='GET'&&p.startsWith('/api/invite/')){const token=decodeURIComponent(p.slice('/api/invite/'.length));const guest=db.guests.find(g=>g.token===token);if(!guest)return error(res,404,'Convite não encontrado');return send(res,200,{guest,event:db.event})}
 if(p==='/api/event'&&req.method==='PUT'){
  try{
   const b=await body(req),baby=clean(b.baby,40);
   if(baby!=='Anya')return error(res,400,'O projeto está configurado exclusivamente para Anya.');
   if(b.date&&!/^\d{4}-\d{2}-\d{2}$/.test(b.date))return error(res,400,'Data inválida.');
   if(b.time&&!/^\d{2}:\d{2}$/.test(b.time))return error(res,400,'Horário inválido.');
   const links={};
   for(const [field,label] of [['mapUrl','mapa'],['giftUrl','lista de presentes'],['photosUrl','fotos'],['musicUrl','música']]){
    const value=clean(b[field],500);
    if(value){try{if(!['http:','https:'].includes(new URL(value).protocol))throw Error()}catch{return error(res,400,`O link de ${label} precisa começar com http:// ou https://.`)}}
    links[field]=value;
   }
   db.event={baby,date:clean(b.date,10),time:clean(b.time,5),address:clean(b.address,180),message:clean(b.message,240),...links};
   writeDb();return send(res,200,{event:db.event});
  }catch(e){return error(res,400,e.message)}
 }
 if(p==='/api/guests'&&req.method==='POST'){try{const b=await body(req),name=clean(b.name,90);if(!name)return error(res,400,'Informe o nome do convidado.');const guest={id:crypto.randomUUID(),token:crypto.randomBytes(8).toString('base64url'),name,phone:clean(b.phone,24),note:clean(b.note,160),status:'pending',partySize:1,createdAt:new Date().toISOString()};db.guests.push(guest);writeDb();return send(res,201,{guest})}catch(e){return error(res,400,e.message)}}
 const guestMatch=p.match(/^\/api\/guests\/([\w-]+)$/);
 if(guestMatch&&req.method==='PATCH'){try{const b=await body(req),g=db.guests.find(x=>x.id===guestMatch[1]);if(!g)return error(res,404,'Convidado não encontrado');const name=clean(b.name,90);if(!name)return error(res,400,'Informe o nome do convidado.');g.name=name;g.phone=clean(b.phone,24);g.note=clean(b.note,160);writeDb();return send(res,200,{guest:g})}catch(e){return error(res,400,e.message)}}
 const rsvp=p.match(/^\/api\/rsvp\/([^/]+)$/);
 if(rsvp&&req.method==='POST'){try{const token=decodeURIComponent(rsvp[1]),g=db.guests.find(x=>x.token===token);if(!g)return error(res,404,'Convite não encontrado');const b=await body(req);if(!['yes','no','pending'].includes(b.status))return error(res,400,'Selecione uma resposta válida.');const size=Number(b.partySize||1);if(!Number.isInteger(size)||size<1||size>8)return error(res,400,'Número de pessoas inválido.');g.status=b.status;g.partySize=b.status==='yes'?size:1;g.respondedAt=b.status==='pending'?'':new Date().toISOString();writeDb();return send(res,200,{guest:g})}catch(e){return error(res,400,e.message)}}
 const check=p.match(/^\/api\/checklist\/([\w-]+)$/);
 if(check&&req.method==='PATCH'){try{const b=await body(req),item=db.checklist.find(x=>x.id===check[1]);if(!item)return error(res,404,'Item não encontrado');if(!['','have','missing','expected'].includes(b.status))return error(res,400,'Status inválido');item.status=b.status;writeDb();return send(res,200,{item})}catch(e){return error(res,400,e.message)}}
 if(p.startsWith('/api/'))return error(res,404,'Rota não encontrada');
 if(req.method==='GET'){if(p==='/'||p.startsWith('/convite/'))return staticFile(res,path.join(ROOT,'index.html'));if(p==='/assets/convite-anya-final.jpg')return staticFile(res,path.join(ROOT,'assets','convite-anya-final.jpg'));if(['/assets/convite-anya.webp','/assets/logo-cegonha.webp'].includes(p)){try{const image=Buffer.from(fs.readFileSync(path.join(ROOT,'assets',path.basename(p)+'.b64'),'utf8').trim(),'base64');res.writeHead(200,{'Content-Type':'image/webp','Cache-Control':'public, max-age=86400'});return res.end(image)}catch{return error(res,404,'Imagem não encontrada')}}const name=path.basename(p);if(['app.js','styles.css'].includes(name))return staticFile(res,path.join(ROOT,name));return error(res,404,'Página não encontrada')}
 error(res,405,'Método não permitido');
});
server.listen(PORT,HOST,()=>console.log(`Lá vem cegonha ativo em http://${HOST}:${PORT}`));
