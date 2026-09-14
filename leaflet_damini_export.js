/**
 * DAMINI export layers — built from 3 verified damini.tropmet.res.in/export/proxy URLs:
 *  - raster:  http://10.2.4.43:83/en/En.PulseRad/Output/Contour/Dbz/IITM/IITM.PNG?t=           -> polygon PNG bbox India
 *  - tracks:  http://10.2.4.57:8585/api/?api_key=...&layer_id=2b0038...&method=tracks         -> FeatureCollection 144 storm cells, each cell has tracks[]
 *  - alerts:  http://10.2.4.57:8585/api/?api_key=...&layer_id=ca5300...&method=alerts&level=3-> FeatureCollection level 3 purple polygons (expiring alerts)
 * Wires through /api/damini-raster | /api/damini-tracks | /api/damini-alerts on Vercel; direct on localhost falls back to export proxy.
 */
function addDaminiExportLayers(map, opts = {}) {
  const apiBase = (() => {
    if (opts.apiBase) return opts.apiBase.replace(/\/$/, "");
    if (typeof location !== "undefined" && /localhost|127\.0\.0\.1/.test(location.hostname)) return "http://localhost:3000";
    if (typeof location !== "undefined" && location.hostname.endsWith("vercel.app")) return location.origin;
    return "https://radar-api-livid.vercel.app";
  })();
  const useDirect = !!opts.useDirect; // bypass Vercel proxy, hit damini directly (CORS may block)
  const rasterGroup = opts.rasterGroup ?? L.layerGroup();
  const tracksGroup = opts.tracksGroup ?? L.layerGroup();
  const alertsGroup = opts.alertsGroup ?? L.layerGroup();

  // ---- raster PNG overlay (India bbox approx from damini map; tuned to IITM composite) ----
  const RASTER_BOUNDS = opts.rasterBounds ?? [[5.5, 66], [37, 97]]; // [southwest, northeast]
  let rasterOverlay = null;
  async function loadRaster() {
    const t = Date.now();
    const url = useDirect
      ? `https://damini.tropmet.res.in/export/proxy/?mode=native&url=${encodeURIComponent("http://10.2.4.43:83/en/En.PulseRad/Output/Contour/Dbz/IITM/IITM.PNG?t=" + t)}`
      : `${apiBase}/api/damini-raster?t=${t}`;
    if (rasterOverlay) map.removeLayer(rasterOverlay);
    rasterOverlay = L.imageOverlay(url, RASTER_BOUNDS, { opacity: opts.rasterOpacity ?? 0.72, crossOrigin: true });
    rasterOverlay.addTo(rasterGroup);
    rasterOverlay.on("error", () => console.warn("[Damini raster] load error", url));
  }

  // ---- tracks: 144 cells, each cell has tracks[] points — render as polylines + cell polygons ----
  let trackMarkers = [];
  async function loadTracks() {
    const url = useDirect
      ? "https://damini.tropmet.res.in/export/proxy/?mode=native&url=" + encodeURIComponent("http://10.2.4.57:8585/api/?api_key=a2b4c419-6431-4106-9e7e-225eafd08897&layer_id=2b0038a7_2ecc_4694_bcc4_0e57f278593f&method=tracks")
      : `${apiBase}/api/damini-tracks`;
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      let text = await r.text();
      text = text.replace(/^\uFEFF/, "");
      const j = JSON.parse(text);
      trackMarkers.forEach(m => tracksGroup.removeLayer(m));
      trackMarkers = [];
      const features = j.features || [];
      for (const f of features) {
        // cell polygon
        const ring = f.geometry?.coordinates?.[0] || [];
        if (ring.length >= 4) {
          const latlngs = ring.map(([lon, lat]) => [lat, lon]);
          const cell = f.properties?.cell || {};
          const poly = L.polygon(latlngs, { color: "#ff9800", weight: 1.5, fillOpacity: 0.06, dashArray: "4 4" })
            .bindPopup(`<b>Cell ${cell.id || ""}</b><br>${cell.cellDateTimeUtc || ""}<br>Area ${cell.area?.toFixed?.(1)} km² · ${cell.speed?.toFixed?.(1)} km/h · dir ${cell.direction ?? ""}°<br>Flash rate ${cell.inCloudLightningRate?.toFixed?.(1)}/${cell.cloudGroundightningRate?.toFixed?.(1)} /min`);
          trackMarkers.push(poly);
          tracksGroup.addLayer(poly);
        }
        // track points
        const tracks = f.properties?.tracks || f.properties?.cell?.tracks || [];
        for (const tr of tracks) {
          const m = tr.location?.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/);
          if (!m) continue;
          const lon = parseFloat(m[1]), lat = parseFloat(m[2]);
          const dt = tr.dateTimeUtc || "";
          const dot = L.circleMarker([lat, lon], { radius: 4, color: "#ff5722", fillColor: "#ff5722", fillOpacity: 0.95, weight: 1 })
            .bindPopup(`Track<br>${dt}<br>${lat.toFixed(4)}, ${lon.toFixed(4)}`);
          trackMarkers.push(dot);
          tracksGroup.addLayer(dot);
        }
      }
      if (opts.onTracks) opts.onTracks({ count: features.length });
    } catch (e) { console.warn("[Damini tracks]", e.message || e); }
  }

  // ---- alerts level 3: purple polygons with stroke/fill from server ----
  let alertLayers = [];
  async function loadAlerts() {
    const url = useDirect
      ? "https://damini.tropmet.res.in/export/proxy/?mode=native&url=" + encodeURIComponent("http://10.2.4.57:8585/api/?api_key=a2b4c419-6431-4106-9e7e-225eafd08897&layer_id=ca5300d5_13f4_49b1_8963_0a83ed95bda7&method=alerts&level=3")
      : `${apiBase}/api/damini-alerts`;
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      let text = await r.text();
      text = text.replace(/^\uFEFF/, "");
      const j = JSON.parse(text);
      alertLayers.forEach(l => alertsGroup.removeLayer(l));
      alertLayers = [];
      for (const f of j.features || []) {
        const ring = f.geometry?.coordinates?.[0] || [];
        if (ring.length < 4) continue;
        const latlngs = ring.map(([lon, lat]) => [lat, lon]);
        const p = f.properties || {};
        const alert = p.alert || {};
        const poly = L.polygon(latlngs, {
          color: p.stroke || "#800080",
          weight: p.stroke_width || 2,
          opacity: p.stroke_opacity ?? 1,
          fillColor: p.fill || "#800080",
          fillOpacity: p.fill_opacity ?? 0.12
        }).bindPopup(`<b>Alert L${alert.level ?? 3}</b> · ${p.id || ""}<br>Issue ${alert.issueDateTimeUtc || p.cellDateTimeUtc || ""}<br>Expire ${alert.expireDateTimeUtc || ""}<br>Thresh ${alert.threshold ?? ""} · Area ${p.area?.toFixed?.(0)} km²`);
        alertLayers.push(poly);
        alertsGroup.addLayer(poly);
      }
      if (opts.onAlerts) opts.onAlerts({ count: (j.features || []).length });
    } catch (e) { console.warn("[Damini alerts]", e.message || e); }
  }

  let t1 = null, t2 = null, t3 = null;
  function start() {
    loadRaster(); loadTracks(); loadAlerts();
    if ((opts.rasterRefreshMs ?? 300000) > 0) t1 = setInterval(loadRaster, opts.rasterRefreshMs ?? 300000);
    if ((opts.tracksRefreshMs ?? 60000) > 0) t2 = setInterval(loadTracks, opts.tracksRefreshMs ?? 60000);
    if ((opts.alertsRefreshMs ?? 60000) > 0) t3 = setInterval(loadAlerts, opts.alertsRefreshMs ?? 60000);
  }
  function stop() { if (t1) clearInterval(t1); if (t2) clearInterval(t2); if (t3) clearInterval(t3); }

  return { rasterGroup, tracksGroup, alertsGroup, loadRaster, loadTracks, loadAlerts, start, stop, RASTER_BOUNDS };
}
