import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(url, serviceKey, { auth: { persistSession: false } });
const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
const publishableKey = publishableKeys.default || Deno.env.get("SUPABASE_ANON_KEY") || "";

const enc = new TextEncoder();
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};
const attempts = new Map<string, { count: number; reset: number }>();
const publicSubmissions = new Map<string, { count: number; reset: number }>();
const messageSubmissions = new Map<string, { count: number; reset: number }>();

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
  const payload = b64url(JSON.stringify({ sub: "ninho-admin", v: 2, exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60 }));
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
    return payload.sub === "ninho-admin" && payload.v === 2 && Number(payload.exp) > Math.floor(Date.now() / 1000);
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
    dressCode: row.dress_code || "",
    pixKey: row.pix_key || "",
    pixRecipient: row.pix_recipient || "",
    weatherLat: row.weather_lat ?? "",
    weatherLon: row.weather_lon ?? "",
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
    bringingChild: row.bringing_child ?? null,
    dietaryRestriction: row.dietary_restriction || "",
    createdAt: row.created_at,
    respondedAt: row.responded_at || "",
  };
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function localDate() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

async function giftsOpen() {
  const { data, error } = await db.from("ninho_event").select("event_date").eq("id", 1).single();
  if (error) throw error;
  return !!data.event_date && localDate() > data.event_date;
}

function htmlEscape(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
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
    if (path === "/api/public-event" && req.method === "GET") {
      const { data, error } = await db.from("ninho_event").select("event_date,event_time,address,map_url,dress_code,weather_lat,weather_lon,pix_key,pix_recipient").eq("id", 1).single();
      if (error) throw error;
      return reply(200, { event: eventOut(data) });
    }
    if (publicInvite && req.method === "GET") {
      const { data: guest, error: guestError } = await db.from("ninho_guests").select("*").eq("token", publicInvite[1]).maybeSingle();
      if (guestError) throw guestError;
      if (!guest) return reply(404, { error: "Convite não encontrado." });
      const { data: event, error: eventError } = await db.from("ninho_event").select("*").eq("id", 1).single();
      if (eventError) throw eventError;
      const [{ data: reserved }, { data: guess }] = await Promise.all([
        db.from("ninho_checklist").select("id,name,status").eq("reserved_by", guest.id),
        db.from("ninho_guesses").select("birth_date,weight_grams").eq("guest_id", guest.id).maybeSingle(),
      ]);
      return reply(200, { guest: guestOut(guest), event: eventOut(event), reserved: reserved || [], guess });
    }

    const invitePage = path.match(/^\/invite\/([a-f0-9]{48})$/);
    if (invitePage && req.method === "GET") {
      return new Response(null, { status: 302, headers: { ...cors, "Location": `https://la-vem-cegonha.vercel.app/convite/${invitePage[1]}`, "Cache-Control": "no-store" } });
    }

    const rsvp = path.match(/^\/api\/rsvp\/([a-f0-9]{48})$/);
    if (rsvp && req.method === "POST") {
      const body = await jsonBody(req);
      if (!['yes', 'no', 'pending'].includes(body?.status)) return reply(400, { error: "Selecione uma resposta válida." });
      const partySize = Number(body?.partySize || 1);
      if (!Number.isInteger(partySize) || partySize < 1 || partySize > 8) return reply(400, { error: "Número de pessoas inválido." });
      const dietaryRestriction = clean(body?.dietaryRestriction, 180);
      const bringingChild = body?.bringingChild === true ? true : body?.bringingChild === false ? false : null;
      const { data, error } = await db.from("ninho_guests").update({
        status: body.status,
        party_size: body.status === "yes" ? partySize : 1,
        responded_at: body.status === "pending" ? null : new Date().toISOString(),
        dietary_restriction: body.status === "yes" ? dietaryRestriction : "",
        bringing_child: body.status === "yes" ? bringingChild : null,
      }).eq("token", rsvp[1]).select("*").maybeSingle();
      if (error) throw error;
      if (!data) return reply(404, { error: "Convite não encontrado." });
      return reply(200, { guest: guestOut(data) });
    }

    if (path === "/api/public-rsvp" && req.method === "POST") {
      const body = await jsonBody(req);
      const name = clean(body?.name, 90);
      const status = body?.status;
      const partySize = Number(body?.partySize || 1);
      if (name.length < 2) return reply(400, { error: "Informe seu nome para confirmar." });
      if (!['yes', 'no'].includes(status)) return reply(400, { error: "Escolha uma resposta." });
      if (!Number.isInteger(partySize) || partySize < 1 || partySize > 8) return reply(400, { error: "Selecione de 1 a 8 pessoas." });
      const dietaryRestriction = clean(body?.dietaryRestriction, 180);
      const bringingChild = body?.bringingChild === true ? true : body?.bringingChild === false ? false : null;
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      const now = Date.now();
      const recent = publicSubmissions.get(ip);
      if (recent && recent.reset > now && recent.count >= 5) return reply(429, { error: "Muitas confirmações. Tente novamente mais tarde." });
      if (!recent || recent.reset <= now) publicSubmissions.set(ip, { count: 1, reset: now + 15 * 60 * 1000 });
      else publicSubmissions.set(ip, { count: recent.count + 1, reset: recent.reset });
      const { data, error } = await db.from("ninho_guests").insert({
        name, status, party_size: status === "yes" ? partySize : 1,
        responded_at: new Date().toISOString(),
        note: "Resposta pelo convite público",
        dietary_restriction: status === "yes" ? dietaryRestriction : "",
        bringing_child: status === "yes" ? bringingChild : null,
      }).select("*").single();
      if (error) throw error;
      return reply(201, { guest: guestOut(data) });
    }

    if (path === "/api/public-checklist" && req.method === "GET") {
      const { data, error } = await db.from("ninho_checklist")
        .select("id,priority,category,icon,name,quantity,shop_links,price_band")
        .in("status", ["", "missing"])
        .order("priority").order("category").order("name");
      if (error) throw error;
      return reply(200, { checklist: data });
    }

    const reserve = path.match(/^\/api\/reserve\/([\w-]+)$/);
    if (reserve && req.method === "POST") {
      const body = await jsonBody(req);
      const token = clean(body?.token, 48);
      if (!/^[a-f0-9]{48}$/.test(token)) return reply(400, { error: "Abra o seu convite individual para escolher um item." });
      const { data: guest, error: guestError } = await db.from("ninho_guests").select("id").eq("token", token).maybeSingle();
      if (guestError) throw guestError;
      if (!guest) return reply(404, { error: "Convite não encontrado." });
      const { data: claimed, error } = await db.rpc("ninho_reserve_item", { p_item_id: reserve[1], p_guest_id: guest.id });
      if (error) throw error;
      if (!claimed) return reply(409, { error: "Este item já saiu da lista. Atualize para escolher outro." });
      return reply(200, { ok: true });
    }

    const purchase = path.match(/^\/api\/purchase\/([\w-]+)$/);
    if (purchase && req.method === "POST") {
      const token = clean((await jsonBody(req))?.token, 48);
      const { data: guest } = await db.from("ninho_guests").select("id").eq("token", token).maybeSingle();
      if (!guest) return reply(404, { error: "Convite não encontrado." });
      const { data: item, error } = await db.from("ninho_checklist").update({ status: "purchased" })
        .eq("id", purchase[1]).eq("reserved_by", guest.id).eq("status", "reserved").select("id").maybeSingle();
      if (error) throw error;
      if (!item) return reply(409, { error: "Reserva indisponível ou já marcada." });
      return reply(200, { ok: true });
    }

    const guess = path.match(/^\/api\/guess\/([a-f0-9]{48})$/);
    if (guess && req.method === "POST") {
      const body = await jsonBody(req);
      const birthDate = clean(body?.birthDate, 10), weight = Number(body?.weightGrams);
      if (birthDate && (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(Date.parse(birthDate)))) return reply(400, { error: "Data inválida." });
      if (!Number.isInteger(weight) || weight < 500 || weight > 7000) return reply(400, { error: "Informe peso entre 500 g e 7000 g." });
      const { data: guest } = await db.from("ninho_guests").select("id").eq("token", guess[1]).maybeSingle();
      if (!guest) return reply(404, { error: "Convite não encontrado." });
      const { error } = await db.from("ninho_guesses").upsert({ guest_id: guest.id, birth_date: birthDate || null, weight_grams: weight, updated_at: new Date().toISOString() }, { onConflict: "guest_id" });
      if (error) throw error;
      return reply(200, { ok: true });
    }

    if (path === "/api/public-messages" && req.method === "GET") {
      const { data, error } = await db.from("ninho_messages")
        .select("author_name,message,created_at")
        .eq("approved", true).order("created_at", { ascending: false }).limit(60);
      if (error) throw error;
      return reply(200, { messages: data });
    }

    if (path === "/api/public-messages" && req.method === "POST") {
      const body = await jsonBody(req);
      const message = clean(body?.message, 500);
      let authorName = clean(body?.name, 90);
      let guestId: string | null = null;
      if (body?.token) {
        if (typeof body.token !== "string" || !/^[a-f0-9]{48}$/.test(body.token)) return reply(400, { error: "Convite inválido." });
        const { data: guest, error } = await db.from("ninho_guests").select("id,name").eq("token", body.token).maybeSingle();
        if (error) throw error;
        if (!guest) return reply(404, { error: "Convite não encontrado." });
        authorName = guest.name;
        guestId = guest.id;
      }
      if (authorName.length < 2 || message.length < 3) return reply(400, { error: "Informe seu nome e um recado com pelo menos 3 caracteres." });
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      const now = Date.now();
      const recent = messageSubmissions.get(ip);
      if (recent && recent.reset > now && recent.count >= 3) return reply(429, { error: "Muitos recados enviados. Tente novamente mais tarde." });
      if (!recent || recent.reset <= now) messageSubmissions.set(ip, { count: 1, reset: now + 15 * 60 * 1000 });
      else messageSubmissions.set(ip, { count: recent.count + 1, reset: recent.reset });
      const { error } = await db.from("ninho_messages").insert({ guest_id: guestId, author_name: authorName, message });
      if (error) throw error;
      return reply(201, { ok: true, moderation: "pending" });
    }

    if (path === "/api/mural" && req.method === "GET") {
      if (!(await giftsOpen())) return reply(200, { messages: [] });
      const { data, error } = await db.from("ninho_gifts")
        .select("donor_name,message,created_at")
        .eq("publish_message", true).neq("message", "")
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return reply(200, { messages: data });
    }

    if (!(await needAdmin(req))) return reply(401, { error: "Acesso administrativo necessário." });

    if (path === "/api/data" && req.method === "GET") {
      const [eventResult, guestResult, checklistResult, giftsResult, messagesResult, guessesResult] = await Promise.all([
        db.from("ninho_event").select("*").eq("id", 1).single(),
        db.from("ninho_guests").select("*").order("created_at", { ascending: true }),
        db.from("ninho_checklist").select("*").order("priority").order("category").order("name"),
        db.from("ninho_gifts").select("*").order("created_at", { ascending: false }),
        db.from("ninho_messages").select("*").order("created_at", { ascending: false }),
        db.from("ninho_guesses").select("guest_id,birth_date,weight_grams,updated_at").order("updated_at", { ascending: false }),
      ]);
      if (eventResult.error) throw eventResult.error;
      if (guestResult.error) throw guestResult.error;
      if (checklistResult.error) throw checklistResult.error;
      if (giftsResult.error) throw giftsResult.error;
      if (messagesResult.error) throw messagesResult.error;
      if (guessesResult.error) throw guessesResult.error;
      return reply(200, { event: eventOut(eventResult.data), guests: guestResult.data.map(guestOut), checklist: checklistResult.data, gifts: giftsResult.data, messages: messagesResult.data, guesses: guessesResult.data, giftsOpen: await giftsOpen() });
    }

    const messagePath = path.match(/^\/api\/messages\/([a-f0-9-]{36})$/);
    if (messagePath && req.method === "PATCH") {
      const body = await jsonBody(req);
      if (typeof body?.approved !== "boolean") return reply(400, { error: "Selecione se o recado deve aparecer no site." });
      const { data, error } = await db.from("ninho_messages").update({ approved: body.approved }).eq("id", messagePath[1]).select("*").maybeSingle();
      if (error) throw error;
      if (!data) return reply(404, { error: "Recado não encontrado." });
      return reply(200, { message: data });
    }

    if (messagePath && req.method === "DELETE") {
      const { error } = await db.from("ninho_messages").delete().eq("id", messagePath[1]);
      if (error) throw error;
      return reply(200, { ok: true });
    }

    if (path === "/api/gifts" && req.method === "POST") {
      if (!(await giftsOpen())) return reply(403, { error: "O registro de presentes abre no dia seguinte ao chá." });
      const body = await jsonBody(req);
      const donorName = clean(body?.donorName, 90);
      const description = clean(body?.description, 180);
      const message = clean(body?.message, 300);
      const guestId = body?.guestId || null;
      const itemId = body?.itemId || null;
      if (donorName.length < 2 || description.length < 2) return reply(400, { error: "Informe quem presenteou e o presente." });
      if (guestId) {
        const { data: guest } = await db.from("ninho_guests").select("id").eq("id", guestId).maybeSingle();
        if (!guest) return reply(400, { error: "Convidado não encontrado." });
      }
      if (itemId) {
        const { data: item } = await db.from("ninho_checklist").select("id").eq("id", itemId).maybeSingle();
        if (!item) return reply(400, { error: "Item não encontrado." });
      }
      const { data: gift, error } = await db.from("ninho_gifts").insert({
        guest_id: guestId, donor_name: donorName, item_id: itemId,
        gift_description: description, message, publish_message: !!body?.publishMessage && !!message,
      }).select("*").single();
      if (error) throw error;
      if (itemId) {
        const { error: itemError } = await db.from("ninho_checklist").update({ status: "have" }).eq("id", itemId);
        if (itemError) {
          await db.from("ninho_gifts").delete().eq("id", gift.id);
          throw itemError;
        }
      }
      return reply(201, { gift });
    }

    const giftPath = path.match(/^\/api\/gifts\/([a-f0-9-]{36})$/);
    if (giftPath && req.method === "PATCH") {
      if (!(await giftsOpen())) return reply(403, { error: "O registro de presentes ainda não está aberto." });
      const body = await jsonBody(req);
      const message = clean(body?.message, 300);
      const { data, error } = await db.from("ninho_gifts").update({
        message, publish_message: !!body?.publishMessage && !!message,
      }).eq("id", giftPath[1]).select("*").maybeSingle();
      if (error) throw error;
      if (!data) return reply(404, { error: "Presente não encontrado." });
      return reply(200, { gift: data });
    }

    if (giftPath && req.method === "DELETE") {
      if (!(await giftsOpen())) return reply(403, { error: "O registro de presentes ainda não está aberto." });
      const { error } = await db.from("ninho_gifts").delete().eq("id", giftPath[1]);
      if (error) throw error;
      return reply(200, { ok: true });
    }

    if (path === "/api/event" && req.method === "PUT") {
      const body = await jsonBody(req);
      const baby = clean(body?.baby, 40);
      if (baby !== "Anya") return reply(400, { error: "O projeto está configurado exclusivamente para Anya." });
      if (body?.date && !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return reply(400, { error: "Data inválida." });
      if (body?.time && !/^\d{2}:\d{2}$/.test(body.time)) return reply(400, { error: "Horário inválido." });
      const latitude = body?.weatherLat === '' || body?.weatherLat == null ? null : Number(body.weatherLat);
      const longitude = body?.weatherLon === '' || body?.weatherLon == null ? null : Number(body.weatherLon);
      if ((latitude === null) !== (longitude === null) || (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude! < -180 || longitude! > 180))) return reply(400, { error: "Coordenadas inválidas." });
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
        dress_code: clean(body?.dressCode, 120),
        pix_key: clean(body?.pixKey, 120),
        pix_recipient: clean(body?.pixRecipient, 100),
        weather_lat: latitude,
        weather_lon: longitude,
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
    const shopPath = path.match(/^\/api\/checklist\/([\w-]+)\/shops$/);
    if (shopPath && req.method === "PUT") {
      const body = await jsonBody(req);
      if (!Array.isArray(body?.links) || body.links.length > 5 || !['','ate50','50a100','100a200','acima200'].includes(body?.priceBand)) return reply(400, { error: "Confira as lojas e a faixa de preço." });
      const links = [];
      for (const entry of body.links) {
        const label = clean(entry?.label, 60), url = clean(entry?.url, 500);
        try { if (!label || !['http:', 'https:'].includes(new URL(url).protocol)) throw new Error(); }
        catch { return reply(400, { error: "Cada loja precisa de nome e link HTTPS válido." }); }
        links.push({ label, url });
      }
      const { data: item, error } = await db.from("ninho_checklist").update({ shop_links: links, price_band: body.priceBand }).eq("id", shopPath[1]).select("*").maybeSingle();
      if (error) throw error;
      if (!item) return reply(404, { error: "Item não encontrado." });
      return reply(200, { item });
    }
    if (checkPath && req.method === "PATCH") {
      const body = await jsonBody(req);
      if (!['', 'have', 'missing', 'expected', 'purchased'].includes(body?.status)) return reply(400, { error: "Status inválido." });
      const updates = body.status === "purchased" ? { status: body.status } : { status: body.status, reserved_by: null };
      const { data, error } = await db.from("ninho_checklist").update(updates).eq("id", decodeURIComponent(checkPath[1])).select("*").maybeSingle();
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
