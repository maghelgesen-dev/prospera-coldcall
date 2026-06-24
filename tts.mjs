import { getStore } from "@netlify/blobs";

// Henter én samtale (metadata + lyd som base64).
export default async (req) => {
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);
  let b;
  try { b = await req.json(); } catch { return j({ error: "Ugyldig forespørsel" }, 400); }
  if (String(b.password || "") !== process.env.TEAM_PASSWORD) return j({ error: "unauthorized" }, 401);

  const metaKey = b.key || "";
  if (!/^meta\//.test(metaKey)) return j({ error: "Ugyldig nøkkel" }, 400);

  const coaches = (process.env.COACH_NAMES || "magnus,kevin")
    .toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
  const isCoach = coaches.includes(String(b.name || "").trim().toLowerCase());
  if (!isCoach && !metaKey.startsWith(`meta/${safe(b.name || "")}/`)) return j({ error: "forbidden" }, 403);

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
};

function safe(s) { return String(s).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40) || "ukjent"; }
function j(o, s) { return new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } }); }
