// Henter naturlig norsk tale fra Azure Neural TTS og returnerer mp3.
export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    return new Response("Mangler AZURE_SPEECH_KEY / AZURE_SPEECH_REGION i Netlify-miljøvariabler.", { status: 500 });
  }

  let body;
  try { body = await req.json(); }
  catch { return new Response("Ugyldig forespørsel.", { status: 400 }); }

  const text = String(body.text || "").slice(0, 1500);
  const allowed = ["nb-NO-PernilleNeural", "nb-NO-FinnNeural", "nb-NO-IselinNeural"];
  const voice = allowed.includes(body.voice) ? body.voice : "nb-NO-PernilleNeural";

  const ssml =
    `<speak version='1.0' xml:lang='nb-NO'>` +
      `<voice xml:lang='nb-NO' name='${voice}'>${escapeXml(text)}</voice>` +
    `</speak>`;

  try {
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
    if (!r.ok) {
      const t = await r.text();
      return new Response("Azure-feil (" + r.status + "): " + t, { status: r.status });
    }
    const buf = await r.arrayBuffer();
    return new Response(buf, { status: 200, headers: { "content-type": "audio/mpeg" } });
  } catch (e) {
    return new Response("TTS-feil: " + String(e), { status: 502 });
  }
};

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
