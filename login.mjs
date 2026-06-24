import { getStore } from "@netlify/blobs";

// Lagrer én treningssamtale: metadata + tilbakemelding + (valgfritt) lydopptak.
export default async (req) => {
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);
  let b;
  try { b = await req.json(); } catch { return j({ error: "Ugyldig forespørsel" }, 400); }
  if (String(b.password || "") !== process.env.TEAM_PASSWORD) return j({ error: "unauthorized" }, 401);

  const name = safe(b.name || "ukjent");
  const ts = Date.now();
  const store = getStore("sessions");

  const meta = {
    name: b.name || "ukjent",
    ts,
    difficulty: b.difficulty || "",
    value: b.value || "",
    meeting: b.meeting || "",
    score: b.score ?? null,
    selger: b.selger ?? null,
    feedback: b.feedback || null,
    transcript: b.transcript || "",
    hasAudio: false
  };

  if (b.audioBase64) {
    try {
      const buf = Buffer.from(b.audioBase64, "base64");
      await store.set(`audio/${name}/${ts}`, buf, { metadata: { mime: b.mime || "audio/webm" } });
      meta.hasAudio = true;
      meta.mime = b.mime || "audio/webm";
    } catch (e) { /* hopper over lyd hvis den feiler */ }
  }

  await store.setJSON(`meta/${name}/${ts}`, meta);
  return j({ ok: true, ts }, 200);
};

function safe(s) { return String(s).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40) || "ukjent"; }
function j(o, s) { return new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } }); }
