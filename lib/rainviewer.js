let cache=null, cacheAt=0;
export async function getWeatherMaps(){
  const now=Date.now();
  if(cache && now-cacheAt<5*60*1000) return cache;
  const r=await fetch("https://api.rainviewer.com/public/weather-maps.json",{cache:"no-store"});
  if(!r.ok) throw new Error("weather-maps "+r.status);
  const j=await r.json();
  cache={host:j.host, past:j.radar?.past||[], generated:j.generated};
  cacheAt=now;
  return cache;
}
