/**
 * DAMINI flashes proxy — uses export/proxy + api_key (same pattern as alerts/tracks)
 * GET /api/damini?interval=15&clip=1
 */
const LAYER_ID = "4c0c8109_d688_4887_a91e_c5cbbab9dd69";
const API_KEY  = "a2b4c419-6431-4106-9e7e-225eafd08897";

function indiaBbox(lat, lon) {
  return lat >= 5 && lat <= 40 && lon >= 65 && lon <= 100;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();

  const interval = [1, 5, 15, 30, 60].includes(parseInt(req.query.interval, 10))
    ? String(parseInt(req.query.interval, 10)) : "15";
  const clip = req.query.clip !== "0";

  const inner = `http://10.2.4.57:8585/api/?api_key=${API_KEY}&layer_id=${LAYER_ID}&method=flashes&version=1&interval=${interval}&classification=0,1&precision=nanoseconds`;
  const url = `https://damini.tropmet.res.in/export/proxy/?mode=native&url=${encodeURIComponent(inner)}`;

  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    const ct = r.headers.get("content-type") || "";
    if (ct.includes("text/html")) {
      return res.status(401).json({ error: "upstream returned HTML — api_key may have expired" });
    }

    let text = await r.text();
    text = text.replace(/^\uFEFF/, ""); // strip BOM if present

    if (clip) {
      try {
        const j = JSON.parse(text);
        if (Array.isArray(j.features)) {
          j.features = j.features.filter(f => indiaBbox(f[1], f[0]));
          text = JSON.stringify(j);
        }
      } catch { /* not JSON or unexpected shape — forward as-is */ }
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=60");
    res.setHeader("X-Source", url);
    if (!r.ok) return res.status(r.status).send(text);
    res.send(text);
  } catch (e) {
    res.status(502).json({ error: e.message || "fetch failed", source: url });
  }
}
