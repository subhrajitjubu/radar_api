/**
 * ILDN proxy — bypasses CORS for https://ildn.in/imap-data.php
 * GET /api/ildn?span=90
 * Forwards raw 32-byte binary and adds CORS + cache headers.
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  const span = Math.min(180, Math.max(10, parseInt(req.query.span || "90", 10) || 90));
  const url = `https://ildn.in/imap-data.php?ut=latest&span=${span}`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "radar_api proxy", Accept: "*/*" }, cache: "no-store" });
    if (!r.ok) return res.status(r.status).json({ error: `ILDN ${r.status} ${r.statusText}` });
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=30");
    res.setHeader("X-Source", url);
    res.send(buf);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
