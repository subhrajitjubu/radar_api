import {getWeatherMaps} from "../../lib/rainviewer.js";
import {getColorMap} from "../../lib/colors.js";
import {sampleFrame, category} from "../../lib/tile.js";
export default async function handler(req,res){
  res.setHeader("Access-Control-Allow-Origin","*");
  if(req.method==="OPTIONS"){ res.setHeader("Access-Control-Allow-Methods","GET, OPTIONS"); return res.status(204).end(); }
  const lat=parseFloat(req.query.lat), lon=parseFloat(req.query.lon);
  if(isNaN(lat)||isNaN(lon)) return res.status(400).json({error:"lat and lon required"});
  try{
    const {host,past}=await getWeatherMaps();
    const colorMap=await getColorMap();
    const series=await Promise.all(past.map(f=>sampleFrame(host,f,lat,lon,colorMap)));
    const out=series.map(s=>({time:s.time,time_iso:new Date(s.time*1000).toISOString(),hex:s.hex,dBZ:s.dBZ,rain_mm_per_h:+s.rain.toFixed(3),category:category(s.dBZ)}));
    res.setHeader("Cache-Control","public, s-maxage=300, stale-while-revalidate=600");
    res.json({lat,lon,count:out.length,series:out,attribution:"RainViewer"});
  }catch(e){ res.status(500).json({error:e.message}); }
}
