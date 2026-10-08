import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { inviteArt } from "./invite-art.ts";
import { logoArt } from "./logo-art.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(url, serviceKey, { auth: { persistSession: false } });
const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
const publishableKey = publishableKeys.default || Deno.env.get("SUPABASE_ANON_KEY") || "";

const enc = new TextEncoder();
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, OPTIONS",
};
const attempts = new Map<string, { count: number; reset: number }>();

function reply(status: number, value: unknown) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function b64url(value: Uint8Array | string) {
  const binary = typeof value === "string" ? value : String.fromCharCode(...value);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function unb64url(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  return atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
}

async function hmacKey() {
  return await crypto.subtle.importKey("raw", enc.encode(serviceKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function makeAdminToken() {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ sub: "ninho-admin", exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60 }));
  const unsigned = `${header}.${payload}`;
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(unsigned)));
  return `${unsigned}.${b64url(signature)}`;
}

async function isAdmin(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const pieces = token.split(".");
  if (pieces.length !== 3) return false;
  try {
    const unsigned = `${pieces[0]}.${pieces[1]}`;
    const signature = Uint8Array.from(unb64url(pieces[2]), (c) => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", await hmacKey(), signature, enc.encode(unsigned));
    if (!valid) return false;
    const payload = JSON.parse(unb64url(pieces[1]));
    return payload.sub === "ninho-admin" && Number(payload.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function eventOut(row: Record<string, unknown>) {
  return {
    baby: row.baby,
    date: row.event_date || "",
    time: typeof row.event_time === "string" ? row.event_time.slice(0, 5) : "",
    address: row.address || "",
    message: row.message || "",
    mapUrl: row.map_url || "",
    giftUrl: row.gift_url || "",
    photosUrl: row.photos_url || "",
    musicUrl: row.music_url || "",
  };
}

function guestOut(row: Record<string, unknown>) {
  return {
    id: row.id,
    token: row.token,
    name: row.name,
    phone: row.phone || "",
    note: row.note || "",
    status: row.status,
    partySize: row.party_size || 1,
    createdAt: row.created_at,
    respondedAt: row.responded_at || "",
  };
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function htmlEscape(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function publicInvitePage(guest: Record<string, unknown>, event: Record<string, unknown>, token: string) {
  const e = eventOut(event);
  const isLevi = e.baby === "LEVI";
  const date = e.date ? new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(new Date(`${e.date}T12:00:00`)) + (e.time ? ` · ${e.time}` : "") : "Data a definir";
  const baby = isLevi ? "Levi" : "Anya";
  const guestName = htmlEscape(guest.name), address = htmlEscape(e.address || "Endereço a definir"), message = htmlEscape(e.message || "Venha celebrar conosco!");
  const map = e.mapUrl ? `<a href="${htmlEscape(e.mapUrl)}" target="_blank" rel="noopener">Ver local no mapa ↗</a>` : "";
  const answered = guest.status === "yes" || guest.status === "no";
  const response = guest.status === "yes" ? "Presença confirmada" : "Não poderá comparecer";
  const api = `${url}/functions/v1/ninho-api/api`;
  const art = isLevi
    ? `<figure class="levi-art"><span class="stars">✦ &nbsp; ✦ &nbsp; ✦</span><span class="tiny">LÁ VEM CEGONHA · CHÁ DE BEBÊ</span><span class="small">Nosso pequeno</span><strong>Levi</strong><span class="arrive">está chegando</span><p>Venha celebrar conosco!</p><div class="art-details"><span>◷ ${htmlEscape(date)}</span><span>⌖ ${address}</span></div><span class="tiny">UM NOVO CAPÍTULO COMEÇA</span></figure>`
    : `<figure class="anya-art"><img src="data:image/webp;base64,${inviteArt}" alt="Convite ilustrado de Anya com gato, caldeirão e detalhes em roxo"><figcaption class="art-label"><span>◷ ${htmlEscape(date)}</span><span>⌖ ${address}</span></figcaption></figure>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="${isLevi ? "#f5f1e7" : "#f5eafa"}"><title>Convite para ${baby} · Lá vem cegonha</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Allura&family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet"><style>
  *{box-sizing:border-box}body{--accent:#814caf;--soft:#ead8f3;--ink:#392c40;--paper:#fcf9ff;margin:0;padding:22px 14px 44px;background:radial-gradient(ellipse at 12% 0,#f0e1fa,transparent 36%),var(--paper);color:var(--ink);font-family:'DM Sans',sans-serif}body.boy{--accent:#3e634f;--soft:#e4ebe0;--ink:#2e3c36;--paper:#f7f4ec;background:radial-gradient(ellipse at 10% 0,#e4eadb,transparent 40%),var(--paper)}.wrap{max-width:720px;margin:auto}.brand{display:flex;align-items:center;justify-content:center;gap:9px;margin:0 auto 17px;color:var(--ink);text-decoration:none}.mark{width:44px;height:44px;flex:none;border:1px solid #e1d4e7;border-radius:12px;background:#fff url('data:image/webp;base64,${logoArt}') 53% 18%/130px auto no-repeat}.brand strong{font:700 20px 'Playfair Display',serif}.brand small{display:block;color:#80728c;font-size:9px;letter-spacing:1.2px;text-transform:uppercase}.boy .brand strong{font-family:'DM Sans',sans-serif}.card{background:#fff;border:1px solid var(--soft);border-radius:18px;padding:clamp(14px,4vw,28px);box-shadow:0 18px 55px #43205a14}.anya-art,.levi-art{position:relative;margin:0 auto 18px;max-width:590px}.anya-art img{display:block;width:100%;height:auto;border-radius:8px}.art-label{position:absolute;left:7.5%;top:68%;width:56%;height:17.5%;display:flex;flex-direction:column;justify-content:center;gap:6%;padding:1.5% 3%;background:#e6c5f0;color:#5d3482;border-radius:999px;font-size:clamp(7px,1.6vw,12px);font-weight:600}.art-label span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.levi-art{isolation:isolate;overflow:hidden;aspect-ratio:1.408;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:6%;border:1px solid #d0d9c6;border-radius:14px;background:radial-gradient(circle at 50% 13%,#e8d9ac 0 9%,transparent 9.2%),radial-gradient(ellipse at 50% 110%,#cbd8c3 0 31%,transparent 31.3%),linear-gradient(155deg,#fbf8ee,#e8eee4 74%,#dce5d6);color:#2d4738}.levi-art:before{content:'';position:absolute;inset:4%;border:1px solid #8caa8b;border-radius:130px 130px 12px 12px;opacity:.55;pointer-events:none}.levi-art .stars{position:absolute;top:18%;left:14%;right:14%;display:flex;justify-content:space-between;color:#a8824f}.levi-art .tiny{font:700 clamp(7px,1.5vw,11px) 'DM Sans',sans-serif;letter-spacing:.2em;color:#68806a}.levi-art .small{font:500 clamp(16px,3vw,28px) 'DM Sans',sans-serif;margin-top:8%}.levi-art strong{font:700 clamp(60px,16vw,110px)/1 'DM Sans',sans-serif;letter-spacing:-.09em;padding-right:.1em}.levi-art .arrive{font-size:clamp(18px,3.4vw,29px)}.levi-art p{font-size:clamp(10px,2vw,16px);color:#856f4c;margin:4% 0}.art-details{display:flex;justify-content:center;gap:5%;width:90%;padding:3%;border-radius:10px;background:#325542;color:#fff;font-size:clamp(8px,1.8vw,13px);font-weight:600}.art-details span{overflow:hidden;text-overflow:ellipsis}.levi-art .tiny:last-child{margin-top:5%}.eyebrow{text-align:center;color:var(--accent);font-size:10px;letter-spacing:2px;font-weight:700}.title{text-align:center;margin:14px 0 0;color:var(--accent);font:clamp(72px,14vw,106px)/1.1 'Allura',cursive;padding:.04em .15em .1em}.boy .title{font:700 clamp(60px,12vw,86px)/1.1 'DM Sans',sans-serif;letter-spacing:-.07em}.arriving{text-align:center;margin:0 0 14px;font-size:11px;letter-spacing:3px}.message{text-align:center;color:var(--accent);font:600 17px 'Playfair Display',serif;margin:16px 0 20px}.boy .message{font-family:'DM Sans',sans-serif}.details{display:grid;grid-template-columns:1fr 1fr;gap:12px;background:var(--soft);border-radius:25px;padding:16px}.details div{text-align:center}.details b{display:block;color:var(--accent);font-size:9px;letter-spacing:1px;margin-bottom:6px}.details span{font-size:13px;line-height:1.5}.details a{display:block;color:var(--accent);font-size:11px;margin-top:6px}.for{text-align:center;color:#74667a;font-size:12px;margin:16px 0}.rsvp{padding:18px;background:var(--paper);border:1px solid var(--soft);border-radius:14px;text-align:center}.rsvp h2{font:600 22px 'Playfair Display',serif;margin:0 0 6px}.boy .rsvp h2{font-family:'DM Sans',sans-serif}.rsvp p{font-size:13px;color:#766b79;margin:0 0 14px}.controls{display:flex;gap:9px;justify-content:center;flex-wrap:wrap}.controls select,.controls button{font:600 13px 'DM Sans',sans-serif;border-radius:9px;padding:11px 13px;border:1px solid var(--soft);background:#fff;color:var(--ink)}.controls button{background:var(--accent);color:#fff;border:0;cursor:pointer}.error{color:#a6454a;min-height:18px;font-size:12px;margin-top:8px}.footer{text-align:center;color:#928598;font-size:11px;margin:16px 0 0}.logo-full{display:block;width:150px;height:auto;margin:13px auto 0}@media(max-width:520px){.details{grid-template-columns:1fr;border-radius:16px}.controls{display:grid;grid-template-columns:1fr}.controls select,.controls button{width:100%}.levi-art{aspect-ratio:1.15}.art-details{display:grid;gap:6px}.art-label{font-size:7px}}

  .event-card{border:1px solid var(--accent);border-radius:20px;padding:clamp(18px,5vw,30px);margin:0 0 24px;background:#fff}
  .event-card .eyebrow{text-align:center}.event-card h1{font:600 clamp(28px,5vw,40px)/1.15 'Playfair Display',serif;text-align:center;color:var(--accent);margin:8px 0}.boy .event-card h1{font-family:'DM Sans',sans-serif;letter-spacing:-.04em}
  .event-card .greeting{text-align:center;color:#766b79;font-size:14px;margin:0 0 20px}.event-line{border-top:1px solid var(--soft);padding:17px 0 21px;display:flex;gap:17px}.event-icon{font-size:28px;color:var(--accent);line-height:1}.event-line strong{color:var(--accent);font-size:25px}.event-line p{color:var(--ink);font-size:15px;line-height:1.5;margin:4px 0}.event-line a,.extras a{display:inline-block;margin:5px 0;color:var(--accent);font-size:12px;font-weight:700}
  .actions{display:grid;gap:12px}.pill{width:100%;min-height:51px;display:flex;align-items:center;justify-content:center;border-radius:99px;font:700 16px 'DM Sans',sans-serif;cursor:pointer;text-decoration:none}.pill-outline{border:1.5px solid var(--accent);background:#fff;color:var(--accent)}.pill-fill{border:1.5px solid var(--accent);background:var(--accent);color:#fff}.pill:hover{filter:brightness(.95)}
  .rsvp{margin-top:20px;padding:19px 0 0;border:0;border-top:1px solid var(--soft);border-radius:0;background:#fff}.rsvp[hidden]{display:none}.rsvp h2{color:var(--accent)}.rsvp .party{display:flex;justify-content:center;align-items:center;gap:10px;margin:11px 0 13px;font-size:12px;font-weight:600}.party select{padding:10px;border:1px solid var(--soft);border-radius:10px;background:#fff;color:var(--ink);font-size:13px}.answers{display:grid;grid-template-columns:1fr 1fr;gap:10px}.answers button{min-height:46px;border-radius:12px;font:700 14px 'DM Sans',sans-serif;cursor:pointer}.answers .yes{border:1px solid var(--accent);background:var(--accent);color:#fff}.answers .no{border:1px solid var(--soft);background:#fff;color:var(--accent)}.answers button:disabled{opacity:.6;cursor:wait}.extras{display:flex;justify-content:center;gap:22px}
  @media(max-width:520px){.event-card{padding:21px 18px}.event-line{gap:11px}.answers{grid-template-columns:1fr}.rsvp .party{justify-content:space-between}}
  </style></head><body class="${isLevi ? "boy" : ""}"><main class="wrap"><div class="brand"><span class="mark" role="img" aria-label="Cegonha"></span><span><strong>Lá vem cegonha</strong><small>chá de bebê</small></span></div><article class="card">
  <section class="event-card"><p class="eyebrow">UM CONVITE SÓ PARA VOCÊ</p><h1>Chá de bebê de ${baby}</h1><p class="greeting">${guestName}, vamos celebrar a chegada de ${baby}!</p><div class="event-line"><span class="event-icon" aria-hidden="true">▣</span><div><strong>Evento</strong><p>${htmlEscape(date)}</p><p>${address}</p>${map}</div></div><div class="actions"><button id="open" class="pill pill-outline">${answered ? "Ver ou alterar presença" : "Confirmar presença"}</button>${e.giftUrl ? `<a class="pill pill-fill" href="${htmlEscape(e.giftUrl)}" target="_blank" rel="noopener noreferrer">Presentear</a>` : `<button id="gift-pending" class="pill pill-fill">Presentear</button>`}</div>
  <section class="rsvp" id="rsvp" ${answered ? "" : "hidden"} aria-live="polite"><h2 id="heading">${answered ? response : `Você vem, ${guestName}?`}</h2><p id="intro">${answered ? "Sua resposta já foi registrada. Você pode alterá-la aqui." : "Basta tocar na sua resposta. Uma pessoa já está selecionada."}</p><div class="party"><label for="party-size">Quantas pessoas vão?</label><select id="party-size">${Array.from({ length: 8 }, (_, i) => `<option value="${i + 1}" ${Number(guest.party_size || 1) === i + 1 ? "selected" : ""}>${i + 1} pessoa${i ? "s" : ""}</option>`).join("")}</select></div><div class="answers"><button class="yes" data-answer="yes">${answered ? "Atualizar: vou sim" : "Sim, vou!"}</button><button class="no" data-answer="no">Não poderei ir</button></div><div id="error" class="error" role="status"></div></section></section>
  ${art}<p class="eyebrow">${isLevi ? "NOSSO PEQUENO" : "NOSSA PEQUENA"}</p><h1 class="title">${baby}</h1><p class="arriving">ESTÁ CHEGANDO</p><p class="message">♡ ${message} ♡</p><section class="details"><div><b>◷ DATA E HORÁRIO</b><span>${htmlEscape(date)}</span></div><div><b>⌖ LOCAL</b><span>${address}</span>${map}</div></section><p class="for">Um convite especial para <strong>${guestName}</strong></p>${e.photosUrl || e.musicUrl ? `<div class="extras">${e.photosUrl ? `<a href="${htmlEscape(e.photosUrl)}" target="_blank" rel="noopener noreferrer">Fotos ↗</a>` : ""}${e.musicUrl ? `<a href="${htmlEscape(e.musicUrl)}" target="_blank" rel="noopener noreferrer">Música ↗</a>` : ""}</div>` : ""}<p class="footer">Com carinho, esperamos você para celebrar esse novo capítulo.</p><img class="logo-full" src="data:image/webp;base64,${logoArt}" alt="Logo Lá vem cegonha — chá de bebê"></article></main>
  <script>const api=${JSON.stringify(api)},key=${JSON.stringify(publishableKey)},token=${JSON.stringify(token)},panel=document.querySelector('#rsvp'),heading=document.querySelector('#heading'),intro=document.querySelector('#intro'),error=document.querySelector('#error');document.querySelector('#open').addEventListener('click',()=>{panel.hidden=false;panel.scrollIntoView({behavior:'smooth',block:'nearest'})});document.querySelector('#gift-pending')?.addEventListener('click',()=>{document.querySelector('#gift-pending').textContent='Lista de presentes em breve'});document.querySelectorAll('[data-answer]').forEach(button=>button.addEventListener('click',async()=>{const buttons=document.querySelectorAll('[data-answer]');buttons.forEach(b=>b.disabled=true);error.textContent='';try{const status=button.dataset.answer;const r=await fetch(api+'/rsvp/'+token,{method:'POST',headers:{'Content-Type':'application/json','apikey':key},body:JSON.stringify({status,partySize:status==='yes'?Number(document.querySelector('#party-size').value):1})});const j=await r.json();if(!r.ok)throw Error(j.error||'Não foi possível registrar sua resposta.');heading.textContent=j.guest.status==='yes'?'Presença confirmada':'Não poderá comparecer';intro.textContent='Resposta registrada. Você pode alterá-la aqui.';document.querySelector('#open').textContent='Ver ou alterar presença';panel.hidden=false;panel.scrollIntoView({behavior:'smooth',block:'nearest'})}catch(err){error.textContent=err.message}finally{buttons.forEach(b=>b.disabled=false)}}));</script></body></html>`;
}

async function jsonBody(req: Request) {
  try {
    return await req.json();
  } catch {
    throw new Error("JSON inválido.");
  }
}

async function needAdmin(req: Request) {
  return await isAdmin(req);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const path = new URL(req.url).pathname.split("/ninho-api").pop() || "/";

  try {
    if (path === "/api/admin/login" && req.method === "POST") {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      const now = Date.now();
      const attempt = attempts.get(ip);
      if (attempt && attempt.reset > now && attempt.count >= 10) return reply(429, { error: "Muitas tentativas. Aguarde 15 minutos." });
      if (!attempt || attempt.reset <= now) attempts.set(ip, { count: 1, reset: now + 15 * 60 * 1000 });
      else attempts.set(ip, { count: attempt.count + 1, reset: attempt.reset });
      const body = await jsonBody(req);
      const password = clean(body?.password, 200);
      if (!password) return reply(401, { error: "Senha inválida." });
      const { data, error } = await db.rpc("ninho_verify_admin", { p_password: password });
      if (error || data !== true) return reply(401, { error: "Senha administrativa incorreta." });
      attempts.delete(ip);
      return reply(200, { token: await makeAdminToken() });
    }

    const publicInvite = path.match(/^\/api\/invite\/([a-f0-9]{48})$/);
    if (publicInvite && req.method === "GET") {
      const { data: guest, error: guestError } = await db.from("ninho_guests").select("*").eq("token", publicInvite[1]).maybeSingle();
      if (guestError) throw guestError;
      if (!guest) return reply(404, { error: "Convite não encontrado." });
      const { data: event, error: eventError } = await db.from("ninho_event").select("*").eq("id", 1).single();
      if (eventError) throw eventError;
      return reply(200, { guest: guestOut(guest), event: eventOut(event) });
    }

    const invitePage = path.match(/^\/invite\/([a-f0-9]{48})$/);
    if (invitePage && req.method === "GET") {
      const { data: guest, error: guestError } = await db.from("ninho_guests").select("*").eq("token", invitePage[1]).maybeSingle();
      if (guestError) throw guestError;
      if (!guest) return reply(404, { error: "Convite não encontrado." });
      const { data: event, error: eventError } = await db.from("ninho_event").select("*").eq("id", 1).single();
      if (eventError) throw eventError;
      return new Response(publicInvitePage(guest, event, invitePage[1]), { status: 200, headers: { ...cors, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    }

    const rsvp = path.match(/^\/api\/rsvp\/([a-f0-9]{48})$/);
    if (rsvp && req.method === "POST") {
      const body = await jsonBody(req);
      if (!['yes', 'no', 'pending'].includes(body?.status)) return reply(400, { error: "Selecione uma resposta válida." });
      const partySize = Number(body?.partySize || 1);
      if (!Number.isInteger(partySize) || partySize < 1 || partySize > 8) return reply(400, { error: "Número de pessoas inválido." });
      const { data, error } = await db.from("ninho_guests").update({
        status: body.status,
        party_size: body.status === "yes" ? partySize : 1,
        responded_at: body.status === "pending" ? null : new Date().toISOString(),
      }).eq("token", rsvp[1]).select("*").maybeSingle();
      if (error) throw error;
      if (!data) return reply(404, { error: "Convite não encontrado." });
      return reply(200, { guest: guestOut(data) });
    }

    if (!(await needAdmin(req))) return reply(401, { error: "Acesso administrativo necessário." });

    if (path === "/api/data" && req.method === "GET") {
      const [eventResult, guestResult, checklistResult] = await Promise.all([
        db.from("ninho_event").select("*").eq("id", 1).single(),
        db.from("ninho_guests").select("*").order("created_at", { ascending: false }),
        db.from("ninho_checklist").select("*").order("priority").order("category").order("name"),
      ]);
      if (eventResult.error) throw eventResult.error;
      if (guestResult.error) throw guestResult.error;
      if (checklistResult.error) throw checklistResult.error;
      return reply(200, { event: eventOut(eventResult.data), guests: guestResult.data.map(guestOut), checklist: checklistResult.data });
    }

    if (path === "/api/event" && req.method === "PUT") {
      const body = await jsonBody(req);
      const baby = clean(body?.baby, 40);
      if (!['Anya', 'LEVI'].includes(baby)) return reply(400, { error: "Escolha Anya ou LEVI." });
      if (body?.date && !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return reply(400, { error: "Data inválida." });
      if (body?.time && !/^\d{2}:\d{2}$/.test(body.time)) return reply(400, { error: "Horário inválido." });
      const links: Record<string, string> = {};
      for (const [field, label] of [["mapUrl", "mapa"], ["giftUrl", "lista de presentes"], ["photosUrl", "fotos"], ["musicUrl", "música"]]) {
        const value = clean(body?.[field], 500);
        if (value) {
          try { if (!['http:', 'https:'].includes(new URL(value).protocol)) throw new Error(); }
          catch { return reply(400, { error: `O link de ${label} precisa começar com http:// ou https://.` }); }
        }
        links[field] = value;
      }
      const { data, error } = await db.from("ninho_event").update({
        baby,
        event_date: clean(body?.date, 10) || null,
        event_time: clean(body?.time, 5) || null,
        address: clean(body?.address, 180),
        message: clean(body?.message, 240),
        map_url: links.mapUrl,
        gift_url: links.giftUrl,
        photos_url: links.photosUrl,
        music_url: links.musicUrl,
      }).eq("id", 1).select("*").single();
      if (error) throw error;
      return reply(200, { event: eventOut(data) });
    }

    if (path === "/api/guests" && req.method === "POST") {
      const body = await jsonBody(req);
      const name = clean(body?.name, 90);
      if (!name) return reply(400, { error: "Informe o nome do convidado." });
      const { data, error } = await db.from("ninho_guests").insert({ name, phone: clean(body?.phone, 24), note: clean(body?.note, 160) }).select("*").single();
      if (error) throw error;
      return reply(201, { guest: guestOut(data) });
    }

    const guestPath = path.match(/^\/api\/guests\/([\w-]+)$/);
    if (guestPath && req.method === "PATCH") {
      const body = await jsonBody(req);
      const name = clean(body?.name, 90);
      if (!name) return reply(400, { error: "Informe o nome do convidado." });
      const { data, error } = await db.from("ninho_guests").update({ name, phone: clean(body?.phone, 24), note: clean(body?.note, 160) }).eq("id", guestPath[1]).select("*").maybeSingle();
      if (error) throw error;
      if (!data) return reply(404, { error: "Convidado não encontrado." });
      return reply(200, { guest: guestOut(data) });
    }

    const checkPath = path.match(/^\/api\/checklist\/([\w-]+)$/);
    if (checkPath && req.method === "PATCH") {
      const body = await jsonBody(req);
      if (!['', 'have', 'missing'].includes(body?.status)) return reply(400, { error: "Status inválido." });
      const { data, error } = await db.from("ninho_checklist").update({ status: body.status }).eq("id", decodeURIComponent(checkPath[1])).select("*").maybeSingle();
      if (error) throw error;
      if (!data) return reply(404, { error: "Item não encontrado." });
      return reply(200, { item: data });
    }

    return reply(404, { error: "Rota não encontrada." });
  } catch (error) {
    console.error("ninho-api", error);
    return reply(500, { error: "Não foi possível concluir a operação." });
  }
});
