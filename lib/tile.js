import {PNG} from "pngjs";
export function latLngToTile(lat,lon,z=7){
  const x=Math.floor((lon+180)/360 * 2**z);
  const latRad=lat*Math.PI/180;
  const y=Math.floor((1-Math.log(Math.tan(latRad)+1/Math.cos(latRad))/Math.PI)/2 * 2**z);
  const n=2**z*256;
  const px=Math.floor((lon+180)/360 * n)%256;
  const py=Math.floor((1-Math.log(Math.tan(latRad)+1/Math.cos(latRad))/Math.PI)/2 * n)%256;
  return {x,y,px,py};
}
export function dBZToRain(dBZ){ if(dBZ==null) return 0; const Z=Math.pow(10,dBZ/10); return Math.pow(Z/200,1/1.6); }
export function category(dBZ){
  if(dBZ==null) return "no echo";
  if(dBZ<15) return "no / very light"; if(dBZ<25) return "light"; if(dBZ<35) return "moderate";
  if(dBZ<45) return "heavy"; if(dBZ<55) return "very heavy"; return "extreme / hail";
}
export async function sampleFrame(host, frame, lat, lon, colorMap){
  const {x,y,px,py}=latLngToTile(lat,lon,7);
  const url=host + frame.path + "/256/7/"+x+"/"+y+"/2/1_1.png";
  const res=await fetch(url);
  if(!res.ok) return {time:frame.time, hex:null, dBZ:null, rain:0, ok:false};
  const buf=Buffer.from(await res.arrayBuffer());
  const png=PNG.sync.read(buf);
  const idx=(py*256+px)*4;
  const r=png.data[idx], g=png.data[idx+1], b=png.data[idx+2], a=png.data[idx+3];
  if(a===0) return {time:frame.time, hex:"transparent", dBZ:null, rain:0, ok:true};
  const hex="#"+[r,g,b].map(v=>v.toString(16).padStart(2,"0")).join("");
  const dBZ=colorMap.get(hex.slice(0,7)) ?? colorMap.get(hex) ?? null;
  return {time:frame.time, hex, dBZ, rain:dBZ==null?0:dBZToRain(dBZ), ok:true};
}
