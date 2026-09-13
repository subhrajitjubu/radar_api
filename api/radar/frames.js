import {getWeatherMaps} from "../../lib/rainviewer.js";
export default async function handler(req,res){
  res.setHeader("Access-Control-Allow-Origin","*");
  try{
    const {host,past,generated}=await getWeatherMaps();
    res.setHeader("Cache-Control","public, s-maxage=60, stale-while-revalidate=300");
    res.json({host, generated, past});
  }catch(e){ res.status(500).json({error:e.message}); }
}
