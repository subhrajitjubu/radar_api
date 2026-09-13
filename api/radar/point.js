import {getWeatherMaps} from "../../lib/rainviewer.js";
import {getColorMap} from "../../lib/colors.js";
import {sampleFrame, category} from "../../lib/tile.js";
export default async function handler(req,res){
  res.setHeader("Access-Control-Allow-Origin","*");
  if(req.method==="OPTIONS"){ res.setHeader("Access-Control-Allow-Methods","GET, OPTIONS"); return res.status(204).end(); }
  const lat=parseFloat(req.query.lat), lon=parseFloat(req.query.lon);
  if(isNaN(lat)||isNaN(lon)) return res.status(400).json({error:"lat and lon required, e.g. lat=28.6 lon=77.2"});
  try{
    const {host,past}=await getWeatherMaps();
    if(!past.length) return res.status(503).json({error:"no frames"});
    const colorMap=await getColorMap();
    let frame=past[past.length-1];
    if(req.query.at){ const t=parseInt(req.query.at,10); const f=past.find(x=>x.time===t); if(f) frame=f; }
    const r=await sampleFrame(host, frame, lat, lon, colorMap);
    res.setHeader("Cache-Control","public, s-maxage=300, stale-while-revalidate=600");
    res.json({lat,lon,time:r.time,time_iso:new Date(r.time*1000).toISOString(),hex:r.hex,dBZ:r.dBZ,rain_mm_per_h:+r.rain.toFixed(3),category:category(r.dBZ),attribution:"RainViewer",tile: frame.path+"/256/7/{x}/{y}/2/1_1.png"});
  }catch(e){ res.status(500).json({error:e.message}); }
}
