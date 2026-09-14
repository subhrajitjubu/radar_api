/**
 * Damini/ENTLN Leaflet layer v2 — preserves leaflet_damini_layer.js as working version.
 * v2: localhost-aware proxy, retry/backoff, shows note when X-Damini-Auth=login-required (302->/login).
 * Usage:
 *   addDaminiLayer(map, { layerGroup: g, interval: 15, proxyUrl: "/api/damini.v2?interval=15" });
 *   // or without proxyUrl it auto-picks localhost:3000 vs /api/damini.v2 on Vercel
 */
function addDaminiLayer(map, opts = {}) {
  const interval = opts.interval ?? 15; // 1,5,15,30,60
  const refreshMs = opts.refreshMs ?? 300000;
  const layerId = opts.layerId ?? "4c0c8109_d688_4887_a91e_c5cbbab9dd69";
  const lg = opts.layerGroup ?? L.layerGroup().addTo(map);
  const isLocalhost = typeof location !== "undefined" && /localhost|127\.0\.0\.1/.test(location.hostname);
  const directProxyBase = "https://damini.tropmet.res.in/api/proxy/layer/";
  function buildDirectUrl() {
    const api = `http://10.2.4.57:8585/api/?method=flashes&version=1&interval=${interval}&classification=0,1&precision=nanoseconds&layer_id=${layerId}`;
    return `${directProxyBase}?layer_id=${layerId}&request=${encodeURIComponent(api)}`;
  }
  // v2 default: /api/damini.v2 (new fail-open). If old path forced: opts.proxyUrl overrides.
  const defaultProxy = isLocalhost ? `http://localhost:3000/api/damini.v2?interval=${interval}` : `/api/damini.v2?interval=${interval}`;
  const url = opts.proxyUrl ?? (opts.useDirect ? buildDirectUrl() : defaultProxy);
  const useCredentials = opts.withCredentials ?? (!opts.proxyUrl && opts.useDirect);
  let timer = null;
  const markers = [];
  function clear() { markers.splice(0).forEach(m => lg.removeLayer(m)); }
  function setNote(text) {
    const el = document.getElementById("lightningWarn");
    if (el) { el.style.display = "inline-block"; el.textContent = text; }
  }
  async function load() {
    let res;
    try { res = await fetch(url, useCredentials ? { credentials: "include" } : {}); }
    catch (e) { console.warn("[Damini v2] fetch", e.message || e); return; }
    const authHdr = res.headers.get("x-damini-auth");
    if (authHdr === "login-required") {
      clear();
      setNote("Damini requires login — map shows ILDN only. Open DAMINI map ↗ for official view.");
      if (opts.onAuthRequired) opts.onAuthRequired();
      return;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn("[Damini v2] HTTP", res.status, body.slice(0,120));
      if (opts.onError) opts.onError(new Error("HTTP " + res.status));
      return;
    }
    let j;
    try { j = await res.json(); } catch { console.warn("[Damini v2] bad JSON"); return; }
    if (j.error && j.error.length) console.warn("[Damini v2]", j.error, j.message);
    // fail-open auth payload with empty features still valid
    if (j.auth === "login-required") {
      clear(); setNote("Damini requires login — ILDN still active.");
      return;
    }
    clear();
    const feats = j.features || [];
    const now = Date.now();
    let kept = 0, stale = 0;
    for (const f of feats) {
      const [lon, lat, , iso, peak] = f;
      if (!(lat >= 5 && lat <= 40 && lon >= 65 && lon <= 100)) continue;
      const ageMin = (now - new Date(iso).getTime()) / 60000;
      if (ageMin < -5 || ageMin > interval + 30) { stale++; continue; }
      const m = L.circleMarker([lat, lon], {
        radius: 5, color: peak < 0 ? "#e74c3c" : "#3498db",
        fillColor: peak < 0 ? "#e74c3c" : "#3498db", fillOpacity: 0.85, weight: 1
      }).bindPopup(`Damini ENTLN v2<br>${iso}<br>${lat.toFixed(3)}, ${lon.toFixed(3)}<br>peak: ${peak} A<br>age: ${ageMin.toFixed(1)} min`);
      m._daminiPeak = peak; m._daminiAge = ageMin;
      markers.push(m); lg.addLayer(m); kept++;
    }
    if (opts.onUpdate) opts.onUpdate({ raw: feats.length, kept, stale, clipped: j._clipped });
  }
  async function warmAndLoad() {
    if (!opts.proxyUrl && opts.useDirect && opts.warmSession !== false) {
      try { await fetch("https://damini.tropmet.res.in/map/?view=55f5bbb4-5d2c-4602-a334-1572015d861e", { credentials: "include", mode: "no-cors" }); } catch {}
    }
    load();
  }
  warmAndLoad();
  if (refreshMs > 0) timer = setInterval(load, refreshMs);
  return { layerGroup: lg, reload: load, stop() { if (timer) clearInterval(timer); } };
}
