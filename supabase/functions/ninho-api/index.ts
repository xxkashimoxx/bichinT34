import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(url, serviceKey, { auth: { persistSession: false } });
const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
const publishableKey = publishableKeys.default || Deno.env.get("SUPABASE_ANON_KEY") || "";
const inviteArt = (await Deno.readTextFile(new URL("./invite-art.b64", import.meta.url))).trim();
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
  const date = e.date ? new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(new Date(`${e.date}T12:00:00`)) + (e.time ? ` · ${e.time}` : "") : "Data a definir";
  const baby = htmlEscape(e.baby), guestName = htmlEscape(guest.name), address = htmlEscape(e.address || "Endereço a definir"), message = htmlEscape(e.message || "Venha celebrar conosco!");
  const map = e.mapUrl ? `<a href="${htmlEscape(e.mapUrl)}" target="_blank" rel="noopener">Ver local no mapa ↗</a>` : "";
  const answered = guest.status === "yes" || guest.status === "no";
  const response = guest.status === "yes" ? "Presença confirmada" : "Não poderá comparecer";
  const api = `${url}/functions/v1/ninho-api/api`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#f5eafa"><title>Convite para ${baby} · Ninho</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Allura&family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet"><style>*{box-sizing:border-box}body{margin:0;padding:24px 14px 44px;background:radial-gradient(ellipse at 12% 0,#f0e1fa,transparent 36%),#fcf9ff;color:#392c40;font-family:'DM Sans',sans-serif}.wrap{max-width:720px;margin:auto}.brand{display:flex;gap:10px;align-items:center;justify-content:center;margin:0 auto 18px;color:#392c40;text-decoration:none}.mark{width:38px;height:38px;display:grid;place-items:center;background:#814caf;color:#fff;border-radius:50%;font:700 21px 'Playfair Display'}.brand strong{font:700 21px 'Playfair Display'}.brand small{display:block;color:#80728c;font-size:9px;letter-spacing:1.2px;text-transform:uppercase}.card{background:#fff;border:1px solid #dfcce9;border-radius:18px;padding:clamp(14px,4vw,28px);box-shadow:0 18px 55px #43205a14}.art{margin:0 auto 16px;max-width:590px}.art img{display:block;width:100%;height:auto;border-radius:6px}.eyebrow{text-align:center;color:#704495;font-size:10px;letter-spacing:2px;font-weight:700}.title{text-align:center;margin:3px 0;color:#824db0;font:clamp(58px,14vw,94px)/.9 'Allura',cursive}.arriving{text-align:center;margin:4px 0 14px;font-size:11px;letter-spacing:3px}.message{text-align:center;color:#9863a7;font:600 17px 'Playfair Display',serif;margin:14px 0 20px}.details{display:grid;grid-template-columns:1fr 1fr;gap:12px;background:#ead8f3;border-radius:28px;padding:16px}.details div{text-align:center}.details b{display:block;color:#694084;font-size:9px;letter-spacing:1px;margin-bottom:6px}.details span{font-size:13px;line-height:1.5}.details a{display:block;color:#663d80;font-size:11px;margin-top:6px}.for{text-align:center;color:#74667a;font-size:12px;margin:16px 0}.rsvp{padding:18px;background:#fbf8fd;border:1px solid #eddfef;border-radius:14px;text-align:center}.rsvp h2{font:600 22px 'Playfair Display',serif;margin:0 0 6px}.rsvp p{font-size:13px;color:#766b79;margin:0 0 14px}.controls{display:flex;gap:9px;justify-content:center;flex-wrap:wrap}.controls select,.controls button{font:600 13px 'DM Sans',sans-serif;border-radius:9px;padding:11px 13px;border:1px solid #e2d5e9;background:#fff;color:#44364b}.controls button{background:#814caf;color:#fff;border:0;cursor:pointer}.error{color:#a6454a;min-height:18px;font-size:12px;margin-top:8px}.footer{text-align:center;color:#928598;font-size:11px;margin:16px 0 0}@media(max-width:520px){.details{grid-template-columns:1fr;border-radius:16px}.controls{display:grid;grid-template-columns:1fr}.controls select,.controls button{width:100%}}</style></head><body><main class="wrap"><a class="brand" href="/"><span class="mark">n</span><span><strong>ninho</strong><small>celebrar a chegada</small></span></a><article class="card"><figure class="art"><img src="data:image/webp;base64,${inviteArt}" alt="Convite ilustrado em roxo para o chá de bebê"></figure><p class="eyebrow">NOSSA ${e.baby === "LEVI" ? "FAMÍLIA CRESCE" : "PEQUENA CHEGADA"}</p><h1 class="title">${baby}</h1><p class="arriving">ESTÁ CHEGANDO</p><p class="message">♡ ${message} ♡</p><section class="details"><div><b>◷ DATA E HORÁRIO</b><span>${htmlEscape(date)}</span></div><div><b>⌖ LOCAL</b><span>${address}</span>${map}</div></section><p class="for">Um convite especial para <strong>${guestName}</strong></p><section class="rsvp"><h2 id="heading">${answered ? response : `Você vem, ${guestName}?`}</h2><p id="intro">${answered ? `Obrigado por responder, ${guestName}.` : "Responda para ajudar a família a se organizar."}</p><form id="form" ${answered ? "hidden" : ""}><div class="controls"><select name="answer" aria-label="Confirmação"><option value="yes">Sim, estarei lá!</option><option value="no">Não poderei ir</option></select><select name="partySize" aria-label="Número de pessoas">${Array.from({ length: 8 }, (_, i) => `<option value="${i + 1}">${i + 1} pessoa${i ? "s" : ""}</option>`).join("")}</select><button>Confirmar presença</button></div></form>${answered ? `<button id="change" class="controls" style="margin:10px auto;padding:10px 14px;border:1px solid #e2d5e9;border-radius:9px;background:#fff;color:#5d3482;cursor:pointer">Alterar resposta</button>` : ""}<div id="error" class="error" role="status"></div></section><p class="footer">Com carinho, esperamos você para celebrar esse novo capítulo.</p></article></main><script>const api=${JSON.stringify(api)},key=${JSON.stringify(publishableKey)},token=${JSON.stringify(token)},form=document.querySelector('#form'),heading=document.querySelector('#heading'),intro=document.querySelector('#intro'),error=document.querySelector('#error');form?.addEventListener('submit',async e=>{e.preventDefault();const v=new FormData(form);error.textContent='';try{const r=await fetch(api+'/rsvp/'+token,{method:'POST',headers:{'Content-Type':'application/json','apikey':key},body:JSON.stringify({status:v.get('answer'),partySize:Number(v.get('partySize'))})}),j=await r.json();if(!r.ok)throw Error(j.error||'Não foi possível registrar sua resposta.');heading.textContent=j.guest.status==='yes'?'Presença confirmada':'Não poderá comparecer';intro.textContent='Obrigado por responder!';form.hidden=true;document.querySelector('#change')?.remove()}catch(err){error.textContent=err.message}});document.querySelector('#change')?.addEventListener('click',()=>{heading.textContent='Você vem?';intro.textContent='Responda para ajudar a família a se organizar.';form.hidden=false;document.querySelector('#change').remove()});</script></body></html>`;
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
      const mapUrl = clean(body?.mapUrl, 500);
      if (mapUrl) {
        try { if (!['http:', 'https:'].includes(new URL(mapUrl).protocol)) throw new Error(); }
        catch { return reply(400, { error: "O link do mapa precisa começar com http:// ou https://." }); }
      }
      const { data, error } = await db.from("ninho_event").update({
        baby,
        event_date: clean(body?.date, 10) || null,
        event_time: clean(body?.time, 5) || null,
        address: clean(body?.address, 180),
        message: clean(body?.message, 240),
        map_url: mapUrl,
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
