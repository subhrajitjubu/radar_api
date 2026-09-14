/**
 * DAMINI radar raster proxy — raw PNG, no CORS headaches
 * GET /api/damini-raster?t=1789377221712  ->  export proxy .../IITM.PNG?t=...
 * Cache-busted: pass ?t=<epochMs> or we add Date.now()
 */
const RASTER_BASE =
  "https://damini.tropmet.res.in/export/proxy/?mode=native&url=" +
  encodeURIComponent("http://10.2.4.43:83/en/En.PulseRad/Output/Contour/Dbz/IITM/IITM.PNG");

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();
  const t = req.query.t || String(Date.now());
  const url = RASTER_BASE + encodeURIComponent("?t=" + t);
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return res.status(r.status).send(await r.text());
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60, stale-while-revalidate=60");
    res.setHeader("X-Source", url);
    res.send(buf);
  } catch (e) {
    res.status(502).json({ error: e.message || "fetch failed", source: url });
  }
}
