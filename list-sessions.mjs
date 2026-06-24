// Sjekker felles teampassord (lagret som miljøvariabel, aldri i koden).
export default async (req) => {
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);
  let b;
  try { b = await req.json(); } catch { return j({ error: "Ugyldig forespørsel" }, 400); }

  const pass = process.env.TEAM_PASSWORD;
  if (!pass) return j({ ok: false, error: "TEAM_PASSWORD er ikke satt i Netlify." }, 500);
  if (String(b.password || "") !== pass) return j({ ok: false, error: "Feil passord." }, 200);

  const coaches = (process.env.COACH_NAMES || "magnus,kevin")
    .toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
  const coach = coaches.includes(String(b.name || "").trim().toLowerCase());

  return j({ ok: true, coach }, 200);
};
function j(o, s) {
  return new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
}
