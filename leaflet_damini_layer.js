/**
 * Damini/ENTLN Leaflet layer
 * Source: https://damini.tropmet.res.in/api/proxy/layer/?layer_id=...&request=<encoded http://10.2.4.57:8585/api/?method=flashes...>
 * Needs WEBAPP_SESSION cookie (GET /map/?view=... once). On other origins use your own proxy.
 * Features: [lon, lat, 0, isoTime, peak_A, ...]
 * Usage:
 *   const damini = L.layerGroup().addTo(map);
 *   addDaminiLayer(map, { layerGroup: damini, interval: 15, refreshMs: 300000 });
 */
function addDaminiLayer(map, opts = {}) {
  const interval = opts.interval ?? 15; // 1,5,15,30,60
  const refreshMs = opts.refreshMs ?? 300000; // proxy cache 30s, UI uses 300s
  const layerId = opts.layerId ?? "4c0c8109_d688_4887_a91e_c5cbbab9dd69";
  const lg = opts.layerGroup ?? L.layerGroup().addTo(map);

  // If hosting on damini.tropmet.res.in same origin: directProxy = true, no CORS.
  // If hosting elsewhere: set opts.proxyUrl to your backend that forwards to the Damini proxy with cookie.
  // e.g. "/api/damini?interval=15" -> your server does the WEBAPP_SESSION + proxy fetch and returns JSON with CORS.
  const directProxyBase = "https://damini.tropmet.res.in/api/proxy/layer/";
  function buildDirectUrl() {
    const api = `http://10.2.4.57:8585/api/?method=flashes&version=1&interval=${interval}&classification=0,1&precision=nanoseconds&layer_id=${layerId}`;
    return `${directProxyBase}?layer_id=${layerId}&request=${encodeURIComponent(api)}`;
  }
  const url = opts.proxyUrl ?? buildDirectUrl();
  const useCredentials = opts.withCredentials ?? !opts.proxyUrl; // direct needs cookie

  let timer = null;
  const markers = [];

  function clear() { markers.splice(0).forEach(m => lg.removeLayer(m)); }

  async function load() {
    try {
      const res = await fetch(url, useCredentials ? { credentials: "include" } : {});
      if (!res.ok) throw new Error("Damini HTTP " + res.status);
      const j = await res.json();
      if (j.error && j.error.length) console.warn("[Damini]", j.error, j.message);
      clear();
      for (const f of (j.features || [])) {
        const [lon, lat, , iso, peak] = f;
        const ageMin = (Date.now() - new Date(iso).getTime()) / 60000;
        // skip old if needed: if (ageMin > interval) continue;
        const m = L.circleMarker([lat, lon], {
          radius: 5,
          color: peak < 0 ? "#e74c3c" : "#3498db",
          fillColor: peak < 0 ? "#e74c3c" : "#3498db",
          fillOpacity: 0.85,
          weight: 1
        }).bindPopup(`Damini ENTLN<br>${iso}<br>${lat.toFixed(3)}, ${lon.toFixed(3)}<br>peak: ${peak} A<br>age: ${ageMin.toFixed(1)} min`);
        markers.push(m);
        lg.addLayer(m);
      }
    } catch (e) {
      console.warn("[Damini]", e);
      if (!opts.proxyUrl) console.warn("[Damini] CORS/cookie blocked. Host a backend proxy that holds WEBAPP_SESSION and forwards to " + directProxyBase);
    }
  }

  // Warm session cookie if direct (fire once, no-cors fetch to set cookie)
  async function warmAndLoad() {
    if (!opts.proxyUrl && opts.warmSession !== false) {
      try { await fetch("https://damini.tropmet.res.in/map/?view=55f5bbb4-5d2c-4602-a334-1572015d861e", { credentials: "include", mode: "no-cors" }); } catch {}
    }
    load();
  }
  warmAndLoad();
  if (refreshMs > 0) timer = setInterval(load, refreshMs);

  return { layerGroup: lg, reload: load, stop() { if (timer) clearInterval(timer); } };
}
