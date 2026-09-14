/**
 * DAMINI tracks proxy — forwards to internal 10.2.4.57:8585 via damini export proxy
 * GET /api/damini-tracks  ->  GET https://damini.tropmet.res.in/export/proxy/?mode=native&url=http://10.2.4.57:8585/api/?api_key=...&layer_id=2b...&method=tracks
 * No auth needed client-side; api_key is embedded in export proxy URL (rotates rarely — update here if upstream changes).
 */
const TRACKS_URL =
  "https://damini.tropmet.res.in/export/proxy/?mode=native&url=" +
  encodeURIComponent(
    "http://10.2.4.57:8585/api/?api_key=a2b4c419-6431-4106-9e7e-225eafd08897&layer_id=2b0038a7_2ecc_4694_bcc4_0e57f278593f&method=tracks"
  );

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();
  try {
    const r = await fetch(TRACKS_URL, { headers: { Accept: "application/json" }, cache: "no-store" });
    const text = await r.text();
    res.setHeader("Content-Type", r.headers.get("content-type") || "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=30, s-maxage=30, stale-while-revalidate=30");
    res.setHeader("X-Source", TRACKS_URL);
    if (!r.ok) return res.status(r.status).send(text);
    res.send(text.replace(/^\uFEFF/, ""));
  } catch (e) {
    res.status(502).json({ error: e.message || "fetch failed", source: TRACKS_URL });
  }
}
