/**
 * ILDN proxy — bypasses CORS for https://ildn.in/imap-data.php
 * GET  /api/ildn?span=90              raw 32-byte binary (default, Leaflet compatible)
 * GET  /api/ildn?span=90&format=json  JSON array {span, count, records[]}
 * HEAD /api/ildn?span=90              headers only (for the map's proxy probe)
 * Binary layout LE per 32-byte record: Float64 unix@0, Float32 lat@8, Float32 lon@12,
 *   Float32 age_min@16, Uint64 id@24
 */
export default async function handler(req, res) {
  for (const h of ["Vary", "Access-Control-Allow-Methods", "Access-Control-Allow-Headers"]) res.removeHeader(h);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET" && req.method !== "HEAD") return res.status(405).json({ error: "method not allowed" });

  const raw = parseInt(req.query.span ?? "90", 10);
  const span = Number.isFinite(raw) ? Math.min(180, Math.max(10, raw)) : 90;
  const wantJson = req.query.format === "json";
  const url = `https://ildn.in/imap-data.php?ut=latest&span=${span}`;

  let upstream;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 9000);
    upstream = await fetch(url, {
      headers: { "User-Agent": "radar_api ildn proxy", Accept: "*/*" },
      cache: "no-store",
      signal: ctrl.signal,
      redirect: "follow",
    });
    clearTimeout(to);
  } catch (e) {
    return res.status(502).json({ error: e.message || "fetch failed", source: url });
  }
  if (!upstream.ok) {
    const body = await upstream.text().catch(() => "");
    return res.status(upstream.status === 502 ? 502 : upstream.status).json({
      error: `ILDN ${upstream.status} ${upstream.statusText}`,
      body: body.slice(0, 300),
    });
  }
  const rawBuf = await upstream.arrayBuffer();
  const buf = new Uint8Array(rawBuf);
  const count = Math.floor(buf.byteLength / 32);

  // JSON debug view — note upstream `age_min` looks stale (e.g. 5000+). We decode faithfully.
  if (wantJson) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const records = [];
    for (let i = 0, off = 0; i < count; i++, off += 32) {
      records.push({
        unix: dv.getFloat64(off + 0, true),
        lat: dv.getFloat32(off + 8, true),
        lon: dv.getFloat32(off + 12, true),
        age_min: dv.getFloat32(off + 16, true),
        id: dv.getBigUint64(off + 24, true).toString(),
      });
    }
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=60");
    res.setHeader("X-Source", url);
    res.setHeader("X-Count", String(count));
    res.setHeader("X-Record-Bytes", "32");
    if (req.method === "HEAD") return res.status(200).end();
    return res.status(200).send(JSON.stringify({ span, count, records }));
  }

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=60");
  res.setHeader("X-Source", url);
  res.setHeader("X-Count", String(count));
  res.setHeader("X-Record-Bytes", "32");
  if (req.method === "HEAD") {
    res.setHeader("Content-Length", String(buf.byteLength));
    return res.status(200).end();
  }
  res.send(Buffer.from(buf));
}
