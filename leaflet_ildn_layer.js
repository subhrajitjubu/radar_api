/**
 * ILDN Leaflet layer — rectified for real upstream data (2026-09-14)
 * Upstream: https://ildn.in/imap-data.php?ut=latest&span=<min>
 * Binary 32 bytes/record LE: Float64 unix@0, Float32 lat@8, Float32 lon@12, Float32 age_sec@16, Uint64 id@24
 * Notes: upstream age field is SECONDS (not minutes) — 5k sec ~ 90 min. Layer recomputes from unix if >300s.
 * On Vercel use proxyUrl "/api/ildn?span=90" to avoid CORS + get X-Count headers. Auto-detects localhost.
 */
function addILDNLayer(map, opts = {}) {
  const span = opts.span ?? 90;
  const refreshMs = opts.refreshMs ?? 60000;
  const lg = opts.layerGroup ?? L.layerGroup().addTo(map);
  const isLocalhost = typeof location !== "undefined" && /localhost|127\.0\.0\.1/.test(location.hostname);
  const directUrl = `https://ildn.in/imap-data.php?ut=latest&span=${span}`;
  const defaultProxy = isLocalhost ? `http://localhost:3000/api/ildn?span=${span}` : `/api/ildn?span=${span}`;
  // prefer explicit proxyUrl; otherwise on localhost use localhost:3000, on deployed site use /api/ildn
  const url = opts.proxyUrl ?? (opts.useDirect ? directUrl : defaultProxy);
  const isProxy = !opts.useDirect && url !== directUrl;

  function ageBand(ageMin) {
    if (ageMin < 30) return "red";
    if (ageMin < 60) return "yellow";
    return "green";
  }
  function colorFor(band) {
    return { red: "#e74c3c", yellow: "#f1c40f", green: "#2ecc71" }[band];
  }

  const panes = {};
  ["red","yellow","green"].forEach((b, i) => {
    const name = `ildn-${b}`;
    if (!map.getPane(name)) {
      const p = map.createPane(name);
      p.style.zIndex = 410 + i;
    }
    panes[b] = name;
  });

  let timer = null;
  let markers = [];
  let lastCount = 0;

  async function load() {
    try {
      const res = await fetch(url, isProxy ? {} : { mode: "cors" });
      if (!res.ok) throw new Error("ILDN HTTP " + res.status);
      const buf = await res.arrayBuffer();
      if (buf.byteLength % 32 !== 0) console.warn("[ILDN] byteLength not multiple of 32:", buf.byteLength);
      const dv = new DataView(buf);
      const N = Math.floor(buf.byteLength / 32);
      const now = Date.now() / 1000;
      markers.forEach(m => lg.removeLayer(m));
      markers = [];
      let kept = 0, outside = 0, stale = 0;
      for (let i = 0; i < N; i++) {
        const off = i * 32;
        const unix = dv.getFloat64(off + 0, true);
        const lat = dv.getFloat32(off + 8, true);
        const lon = dv.getFloat32(off + 12, true);
        const rawAge = dv.getFloat32(off + 16, true);
        // upstream age is seconds (observed ~5400 for ~90 min) or stale; recompute from unix when > span*60+buffer
        const computedAgeMin = (now - unix) / 60;
        const ageMin = rawAge > 300 && Math.abs(computedAgeMin - rawAge) > 120 ? computedAgeMin : (rawAge > 180 ? rawAge / 60 : rawAge);
        const age = ageMin;
        if (!(lat >= 5 && lat <= 40 && lon >= 65 && lon <= 100)) { outside++; continue; }
        // respect span window on client too (server may return stale)
        if (age < -5 || age > span + 30) { stale++; continue; }
        const band = ageBand(age);
        const m = L.circleMarker([lat, lon], {
          radius: band === "red" ? 6 : band === "yellow" ? 5 : 4,
          color: colorFor(band),
          fillColor: colorFor(band),
          fillOpacity: 0.85,
          weight: 1,
          pane: panes[band]
        }).bindPopup(`ILDN<br>age: ${age.toFixed(1)} min<br>${unix ? new Date(unix*1000).toLocaleString() : ""}<br>${lat.toFixed(3)}, ${lon.toFixed(3)}`);
        m._ildnAge = age;
        m._ildnUnix = unix;
        markers.push(m);
        lg.addLayer(m);
        kept++;
      }
      lastCount = kept;
      const hdrCount = res.headers.get("x-count");
      console.log(`[ILDN] ${N} raw, ${kept} India, skipped outside=${outside} stale=${stale}, X-Count=${hdrCount || "-"}`);
      if (typeof opts.onUpdate === "function") opts.onUpdate({ raw: N, kept, outside, stale, hdrCount });
    } catch (e) {
      console.warn("[ILDN]", e.message || e);
      if (!isProxy) console.warn("[ILDN] CORS blocked? Host a proxy: GET /api/ildn forwards to https://ildn.in/imap-data.php");
      if (typeof opts.onError === "function") opts.onError(e);
    }
  }

  load();
  if (refreshMs > 0) timer = setInterval(load, refreshMs);

  return {
    layerGroup: lg,
    reload: load,
    get count() { return lastCount; },
    stop() { if (timer) clearInterval(timer); }
  };
}
