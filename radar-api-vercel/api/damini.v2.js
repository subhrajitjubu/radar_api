/**
 * DAMINI v2 — preserves old working version at /api/damini (unchanged).
 * New path: /api/damini.v2  or  /api/damini?v2=1
 * Changes: timeout + retry, better cookie handling, India bbox clip, s-maxage, HEAD.
 * Still fails with 502 if upstream requires real SSO (login redirect) — fail-open.
 */
let sessionCache = null; // { cookie: string, at: number }

async function fetchWithTimeout(url, opts, ms = 8000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort("timeout"), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(to); }
}

async function getSession() {
  if (sessionCache && Date.now() - sessionCache.at < 8 * 60 * 1000) return sessionCache.cookie;
  const mapUrl = "https://damini.tropmet.res.in/map/?view=55f5bbb4-5d2c-4602-a334-1572015d861e";
  try {
    const r = await fetchWithTimeout(mapUrl, { headers: { "User-Agent": "radar_api damini v2" }, redirect: "manual" }, 7000);
    // Vercel edge may block set-cookie read; collect all set-cookie variants
    const sc = r.headers.getSetCookie ? r.headers.getSetCookie().join("; ") : (r.headers.get("set-cookie") || "");
    const m = sc.match(/WEBAPP_SESSION=[^;]+/);
    const cookie = m ? m[0] : "";
    if (cookie) sessionCache = { cookie, at: Date.now() };
    return cookie;
  } catch { return sessionCache?.cookie || ""; }
}

function indiaBbox(lat, lon) {
  return lat >= 5 && lat <= 40 && lon >= 65 && lon <= 100;
}

export default async function handler(req, res) {
  for (const h of ["Vary", "Access-Control-Allow-Methods", "Access-Control-Allow-Headers"]) res.removeHeader(h);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET" && req.method !== "HEAD") return res.status(405).json({ error: "method not allowed" });

  const interval = [1, 5, 15, 30, 60].includes(parseInt(req.query.interval, 10)) ? String(parseInt(req.query.interval, 10)) : "15";
  const layerId = req.query.layer_id || "4c0c8109_d688_4887_a91e_c5cbbab9dd69";
  const clip = req.query.clip !== "0";

  try {
    const cookie = await getSession().catch(() => "");
    const inner = `http://10.2.4.57:8585/api/?method=flashes&version=1&interval=${interval}&classification=0,1&precision=nanoseconds&layer_id=${layerId}`;
    const url = `https://damini.tropmet.res.in/api/proxy/layer/?layer_id=${layerId}&request=${encodeURIComponent(inner)}`;
    const headers = { "User-Agent": "radar_api damini v2", Accept: "application/json" };
    if (cookie) headers.Cookie = cookie;

    let r;
    try { r = await fetchWithTimeout(url, { headers, cache: "no-store" }, 8000); }
    catch (e) {
      // retry once after refreshing session
      sessionCache = null;
      const c2 = await getSession().catch(() => "");
      if (c2) headers.Cookie = c2;
      r = await fetchWithTimeout(url, { headers, cache: "no-store" }, 8000);
    }

    const isLoginRedirect = r.status === 302 && String(r.headers.get("location") || "").includes("/login");
    if (isLoginRedirect) {
      // upstream requires SSO — return empty but with header so map can show note instead of 502 loop
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60, stale-while-revalidate=60");
      res.setHeader("X-Damini-Auth", "login-required");
      res.setHeader("X-Source", url);
      if (req.method === "HEAD") return res.status(200).end();
      return res.status(200).send(JSON.stringify({ features: [], auth: "login-required", source: url, interval }));
    }

    let text = await r.text();
    let j;
    try { j = JSON.parse(text); } catch { j = null; }

    // optional India clip on server (saves bandwidth to client)
    if (clip && j && Array.isArray(j.features)) {
      const before = j.features.length;
      j.features = j.features.filter(f => indiaBbox(f[1], f[0]));
      j._clipped = before - j.features.length;
      text = JSON.stringify(j);
    }

    res.setHeader("Content-Type", r.headers.get("content-type") || "application/json");
    res.setHeader("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=60");
    res.setHeader("X-Source", url);
    if (j && typeof j.features !== "undefined") res.setHeader("X-Count", String(j.features.length));
    if (req.method === "HEAD") return res.status(200).end();
    if (!r.ok) return res.status(r.status).send(text);
    return res.send(text);
  } catch (e) {
    return res.status(502).json({ error: e.message || "fetch failed" });
  }
}
