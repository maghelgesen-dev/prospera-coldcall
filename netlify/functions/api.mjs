import { getStore } from "@netlify/blobs";

// Én samlet funksjon for alt: Claude, TTS, innlogging og arkiv.
// Ruten velges med ?route=... (gjøres automatisk fra appen).
export default async (req) => {
  const route = new URL(req.url).searchParams.get("route") || "";
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);

  let b;
  try { b = await req.json(); } catch { return j({ error: "Ugyldig forespørsel" }, 400); }

  try {
    if (route === "claude") return await handleClaude(b);
    if (route === "tts") return await handleTts(b);
    if (route === "login") return handleLogin(b);
    if (route === "save-session") return await handleSave(b);
    if (route === "list-sessions") return await handleList(b);
    if (route === "get-session") return await handleGet(b);
    return j({ error: "Ukjent rute: " + route }, 404);
  } catch (e) {
    return j({ error: String(e) }, 502);
  }
};

/* ---------- Claude ---------- */
async function handleClaude(b) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return j({ error: { message: "Mangler ANTHROPIC_API_KEY i Netlify." } }, 500);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: b.model || "claude-sonnet-4-6",
      max_tokens: b.max_tokens || 1000,
      system: b.system,
      messages: b.messages
    })
  });
  const data = await r.json();
  return j(data, r.status);
}

/* ---------- TTS (Azure neural) ---------- */
async function handleTts(b) {
  const key = process.env.AZURE_SPEECH_KEY, region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) return new Response("Mangler AZURE_SPEECH_KEY / AZURE_SPEECH_REGION i Netlify.", { status: 500 });
  const text = String(b.text || "").slice(0, 1500);
  const allowed = ["nb-NO-PernilleNeural", "nb-NO-FinnNeural", "nb-NO-IselinNeural"];
  const voice = allowed.includes(b.voice) ? b.voice : "nb-NO-PernilleNeural";
  const ssml = `<speak version='1.0' xml:lang='nb-NO'><voice xml:lang='nb-NO' name='${voice}'>${escapeXml(text)}</voice></speak>`;
  const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "prospera-coldcall"
    },
    body: ssml
  });
  if (!r.ok) { const t = await r.text(); return new Response("Azure-feil (" + r.status + "): " + t, { status: r.status }); }
  const buf = await r.arrayBuffer();
  return new Response(buf, { status: 200, headers: { "content-type": "audio/mpeg" } });
}

/* ---------- Innlogging ---------- */
function handleLogin(b) {
  const pass = process.env.TEAM_PASSWORD;
  if (!pass) return j({ ok: false, error: "TEAM_PASSWORD er ikke satt i Netlify." }, 500);
  if (String(b.password || "") !== pass) return j({ ok: false, error: "Feil passord." }, 200);
  return j({ ok: true, coach: isCoach(b.name) }, 200);
}

/* ---------- Lagre samtale ---------- */
async function handleSave(b) {
  if (String(b.password || "") !== process.env.TEAM_PASSWORD) return j({ error: "unauthorized" }, 401);
  const name = safe(b.name || "ukjent"), ts = Date.now();
  const store = getStore("sessions");
  const meta = {
    name: b.name || "ukjent", ts, difficulty: b.difficulty || "", value: b.value || "",
    meeting: b.meeting || "", score: b.score ?? null, selger: b.selger ?? null,
    feedback: b.feedback || null, transcript: b.transcript || "", hasAudio: false
  };
  if (b.audioBase64) {
    try {
      await store.set(`audio/${name}/${ts}`, Buffer.from(b.audioBase64, "base64"), { metadata: { mime: b.mime || "audio/webm" } });
      meta.hasAudio = true; meta.mime = b.mime || "audio/webm";
    } catch (e) { /* hopp over lyd */ }
  }
  await store.setJSON(`meta/${name}/${ts}`, meta);
  return j({ ok: true, ts }, 200);
}

/* ---------- Liste ---------- */
async function handleList(b) {
  if (String(b.password || "") !== process.env.TEAM_PASSWORD) return j({ error: "unauthorized" }, 401);
  const coach = isCoach(b.name);
  const wantsAll = b.scope === "all" && coach;
  const store = getStore("sessions");
  const prefix = wantsAll ? "meta/" : `meta/${safe(b.name || "")}/`;
  const rows = [];
  const { blobs } = await store.list({ prefix });
  for (const bl of blobs) {
    try {
      const m = await store.get(bl.key, { type: "json" });
      if (m) rows.push({ key: bl.key, name: m.name, ts: m.ts, difficulty: m.difficulty, meeting: m.meeting, score: m.score, selger: m.selger, hasAudio: m.hasAudio });
    } catch (e) { /* skip */ }
  }
  rows.sort((a, b2) => (b2.ts || 0) - (a.ts || 0));
  return j({ ok: true, rows, coach }, 200);
}

/* ---------- Hent én ---------- */
async function handleGet(b) {
  if (String(b.password || "") !== process.env.TEAM_PASSWORD) return j({ error: "unauthorized" }, 401);
  const metaKey = b.key || "";
  if (!/^meta\//.test(metaKey)) return j({ error: "Ugyldig nøkkel" }, 400);
  if (!isCoach(b.name) && !metaKey.startsWith(`meta/${safe(b.name || "")}/`)) return j({ error: "forbidden" }, 403);
  const store = getStore("sessions");
  const m = await store.get(metaKey, { type: "json" });
  if (!m) return j({ error: "Fant ikke samtalen" }, 404);
  let audio = null, mime = null;
  if (m.hasAudio) {
    try {
      const ab = await store.get(metaKey.replace(/^meta\//, "audio/"), { type: "arrayBuffer" });
      if (ab) { audio = Buffer.from(ab).toString("base64"); mime = m.mime || "audio/webm"; }
    } catch (e) { /* lyd kan mangle */ }
  }
  return j({ ok: true, meta: m, audio, mime }, 200);
}

/* ---------- hjelpere ---------- */
function isCoach(name) {
  const coaches = (process.env.COACH_NAMES || "magnus,kevin").toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
  return coaches.includes(String(name || "").trim().toLowerCase());
}
function safe(s) { return String(s).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40) || "ukjent"; }
function escapeXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function j(o, s) { return new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } }); }
