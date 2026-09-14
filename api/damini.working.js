/**
 * DAMINI (IITM) proxy — handles WEBAPP_SESSION cookie + forwards to /api/proxy/layer/
 * GET /api/damini?interval=15
 * 15/30/60 map to layer interval; class=0,1; hosts the session cookie server-side so client has no CORS pain.
 */
let sessionCache = null; // { cookie: string, at: number }
async function getSession() {
  if (sessionCache && Date.now() - sessionCache.at < 10 * 60 * 1000) return sessionCache.cookie;
  // Warm session by GETting the map page (sets WEBAPP_SESSION)
  const mapUrl = "https://damini.tropmet.res.in/map/?view=55f5bbb4-5d2c-4602-a334-1572015d861e";
  const r = await fetch(mapUrl, { headers: { "User-Agent": "radar_api damini proxy" }, redirect: "manual" });
  const setCookie = r.headers.get("set-cookie") || "";
  // extract WEBAPP_SESSION
  const m = setCookie.match(/WEBAPP_SESSION=[^;]+/);
  const cookie = m ? m[0] : "";
  if (cookie) sessionCache = { cookie, at: Date.now() };
  return cookie;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  const interval = [1, 5, 15, 30, 60].includes(parseInt(req.query.interval, 10)) ? String(parseInt(req.query.interval, 10)) : "15";
  const layerId = req.query.layer_id || "4c0c8109_d688_4887_a91e_c5cbbab9dd69";

  try {
    const cookie = await getSession();
    const inner = `http://10.2.4.57:8585/api/?method=flashes&version=1&interval=${interval}&classification=0,1&precision=nanoseconds&layer_id=${layerId}`;
    const url = `https://damini.tropmet.res.in/api/proxy/layer/?layer_id=${layerId}&request=${encodeURIComponent(inner)}`;
    const headers = { "User-Agent": "radar_api damini proxy", Accept: "application/json" };
    if (cookie) headers.Cookie = cookie;
    const r = await fetch(url, { headers, cache: "no-store" });
    const text = await r.text();
    // DAMINI returns JSON even on 200; forward as-is with CORS
    res.setHeader("Content-Type", r.headers.get("content-type") || "application/json");
    res.setHeader("Cache-Control", "public, max-age=30");
    if (!r.ok) return res.status(r.status).send(text);
    res.send(text);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
