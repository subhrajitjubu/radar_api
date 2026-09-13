let map=null, at=0;
export async function getColorMap(){
  if(map && Date.now()-at<60*60*1000) return map;
  const r=await fetch("https://www.rainviewer.com/files/rainviewer_api_colors_table.csv",{cache:"no-store"});
  const t=await r.text();
  const lines=t.trim().split(/\r?\n/);
  const header=lines[0].split(",");
  let col=header.findIndex(h=>/universal/i.test(h)); if(col<0) col=2;
  map=new Map();
  for(let i=1;i<lines.length;i++){
    const c=lines[i].split(",");
    const dbz=parseInt(c[0],10); const hex=(c[col]||"").trim().toLowerCase(); if(!hex) continue;
    const base=hex.slice(0,7); if(base==="#000000") continue;
    if(!map.has(base)) map.set(base,dbz); map.set(hex,dbz);
  }
  at=Date.now(); return map;
}
