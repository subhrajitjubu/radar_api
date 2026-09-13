import {getWeatherMaps} from "../../lib/rainviewer.js";
// Vercel Cron every 10m. Set CRON_SECRET env; Vercel also sends x-vercel-cron header.
// For PNG persistence wire Vercel Blob: import {put} from "@vercel/blob" and upload composite.
// Stub logs new frames; extend to fetch India bbox tiles (z=6, 42 tiles) and composite via pngjs/sharp.
export default async function handler(req,res){
  const secret=process.env.CRON_SECRET;
  if(secret){
    const auth=req.headers.authorization||"";
    const cronHeader=req.headers["x-vercel-cron"];
    if(!cronHeader && auth!=="Bearer "+secret) return res.status(401).json({error:"unauthorized"});
  }
  try{
    const {host,past}=await getWeatherMaps();
    const latest=past[past.length-1];
    res.json({ok:true, host, frames:past.length, latest: latest?.time, latest_iso: latest? new Date(latest.time*1000).toISOString(): null, note:"stub — wire @vercel/blob for PNG persistence; window 2h step 10m"});
  }catch(e){ res.status(500).json({error:e.message}); }
}
