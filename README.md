# India Radar API — GitHub + Vercel

Lon/lat -> radar rainfall via RainViewer tiles.

## Endpoints
- GET /api/radar/frames
- GET /api/radar/point?lat=28.6&lon=77.2&at=1710000000
- GET /api/radar/timeseries?lat=28.6&lon=77.2
- GET /api/cron/archive  (Vercel Cron every 10m, needs CRON_SECRET)

## Deploy
1. Push this folder to GitHub
2. Import in Vercel dashboard
3. Add env: CRON_SECRET, BLOB_READ_WRITE_TOKEN (for archive persistence)
4. Deploy

Tile math: {host}{path}/256/7/{x}/{y}/2/1_1.png, dBZ via Universal Blue CSV, rain R=(10^(dBZ/10)/200)^0.625
Archive: cron fetches India bbox z=6 (42 tiles) -> composite PNG -> Vercel Blob at archive/YYYY/MM/DD/HHMM.png
