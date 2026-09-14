/**
 * RainViewer colors table proxy — fixes CORS (no ACAO on upstream)
 * GET /api/rainviewer-colors  ->  https://www.rainviewer.com/files/rainviewer_api_colors_table.csv
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();
  const url = "https://www.rainviewer.com/files/rainviewer_api_colors_table.csv";
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return res.status(r.status).send(await r.text());
    const text = await r.text();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600, stale-while-revalidate=3600");
    res.send(text);
  } catch (e) {
    res.status(502).json({ error: e.message || "fetch failed" });
  }
}
