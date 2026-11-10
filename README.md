# Toronto Move

Live trip planner for Toronto: TTC, GO Transit, UP Express, VIA Rail, Pearson flights and Environment Canada weather alerts, in one map-based web app.

## Run it

```bash
npm install
cp .env.example .env    # optional, see "Keys" below
npm run dev             # http://localhost:3000  (auto-restarts on change)
```

Needs Node 22+.

## What works today

| Feature | Source | Live? | Key needed |
|---|---|---|---|
| Trip planner (address → address, all GTA agencies, walk/bike/drive comparison) | MOTIS 2 via [Transitous](https://transitous.org) | Schedules, re-timed with live data below | No |
| TTC predictions, vehicle positions, service alerts | [TTC GTFS-RT](https://gtfsrt.ttc.ca/) | ✅ | No |
| VIA Rail times | Transitous (VIA real-time) | ✅ partly | No |
| GO Transit + UP Express live times, vehicles, alerts | [Metrolinx Open Data API](https://api.openmetrolinx.com/OpenDataAPI/Help/Registration/en) | ✅ once a key is set | **Free key** |
| Pearson arrivals/departures (gate, terminal, delays) | [AeroDataBox](https://rapidapi.com/aedbx-aedbx/api/aerodatabox) on RapidAPI | ✅ once a key is set | **Free/paid key** |
| Current weather, forecast, weather warnings | Environment Canada MSC GeoMet | ✅ | No |
| Address / place search | [Photon](https://photon.komoot.io) (OpenStreetMap) + Transitous: shops, gyms, "X and Y" intersections, "<store> <city>" searches, nearest results first | — | No |

Route ranking (`server/rank.js`) scores every option by arrival time + transfers + walking, and:
- weights walking more heavily in extreme cold or heat, rain or snow, or under an active weather warning, and advises against cycling in those conditions;
- pushes down trips whose route has an active **no service / detour / moved stop** alert at the stops you'd use;
- shifts departure times using live TTC/GO predictions ("Leave in 6 min · 2 min late").

Other features: saved Home/Work, recent destinations, shareable trip links (`?from=…&to=…`), "Departures near me", one-tap "Route me to Pearson T1/T3", dark mode, phone layout.

### Fares (`server/fares.js`)
Every route shows an estimated fare for paying with PRESTO or a debit/credit tap, for adult, youth, senior or child (chosen in the Plan form and remembered).
- **TTC:** $3.30 adult / $2.35 youth / $2.25 senior, 12 and under free. One fare covers TTC transfers.
- **GO:** station-to-station fares from GO's own published fare table (downloaded weekly into `data/go-fares.json`), less the PRESTO discount (adult 15.7%, youth 40%, senior 55%).
- **UP Express:** Pearson trips $9.25 adult / $5.80 senior; shorter UP trips use the GO table.
- **One Fare:** TTC is free when connecting with GO; TTC + MiWay/YRT/Brampton/Durham is charged once. UP Express is not part of One Fare.
- VIA, intercity coaches and other local agencies show as "not included", and the total is marked with a `+`.
- Prices are in `FARES` at the top of `server/fares.js`. Update them when agencies change fares.

### Bike Share Toronto (`server/sources/bikeshare.js`)
Live station data from the official GBFS feed: a **Bike Share** map layer (green = bikes available, orange = low, grey = empty), the nearest stations with bike/e-bike/dock counts in **Nearby**, and a **Bike Share** trip option. That option uses the closest station with bikes and the closest station near your destination with free docks, with backup stations listed and a pay-as-you-go price taken from the live pricing feed. Ride times are estimated from distance.

### Elevator & escalator outages
TTC's accessibility feed is checked every 2 minutes. Outages show on the steps of any route using that station and in the **Alerts** tab. With **Step-free / wheelchair** on, routes through a station with a broken elevator are pushed down and flagged, and watched step-free trips get a heads-up notification.

### Next way home
Once **Home** is saved, a card at the top of the Plan tab shows the best live route home from your current location (or your start point), refreshing every 2 minutes for up to ~30 minutes. It loads automatically when location is already allowed. The installed app also gets **Go home** and **Nearby** home-screen shortcuts.

## Push notifications

Weather notifications: new Environment Canada alerts at the chosen level, "Updated" when one is re-issued, "Ended" when it's lifted, and a heads-up when rain or snow is likely (60%+) within 3 hours. Quiet hours (10 pm–7 am, on by default) hold everything except severe warnings and full service shutdowns until morning. Trip planning uses the hourly forecast for trips later in the day.


Turn them on in the **Alerts** tab. Users get:

| Type | When |
|---|---|
| **Weather** | A new Environment Canada alert for the Toronto area at or above their chosen level (warnings only / + watches / everything) |
| **Route alerts** | A new TTC or GO service alert on a route they follow (`1`, `504`, `29`, `LW`…). Alerts already active when they start following a route are not sent. |
| **Watched trips** | Tap **🔔 Watch this trip** on a planned route and choose a time and days. ~40 min before: a heads-up *only* if there's a disruption, a delay of 5+ min, or bad weather. Then a **"Leave in N min"** reminder using live predictions, and an update if the delay changes by 4+ min. Max 4 per trip per day. |

How it works: standard Web Push (`web-push` library, VAPID). `public/sw.js` shows the notifications. `server/notifier.js` runs every minute, and `data/push.json` stores subscriptions plus the auto-generated VAPID keys (git-ignored, **back it up**: losing the keys means everyone has to re-subscribe). Each watched trip uses ~13 Transitous route plans per day.

Platform notes:
- Works in Chrome, Edge, Firefox and Safari on desktop and Android.
- **iPhone/iPad** (iOS 16.4+): the user must first *Add to Home Screen* and open the app from there. The app tells them this.
- Phones need the site served over **HTTPS** (localhost is fine for development).
- Notification permission is blocked inside the Claude desktop app's preview browser, so test in a normal browser.

## Keys (`.env`)

| Variable | What it unlocks |
|---|---|
| `CONTACT` | Your website or email address. Transitous asks every app to send this in its User-Agent. **Set it before sharing the app.** |
| `METROLINX_API_KEY` | Live GO train/bus + UP Express times and alerts |
| `AERODATABOX_RAPIDAPI_KEY` | Live Pearson flights board |
| `MOTIS_URL` | Point routing at your own MOTIS server instead of Transitous |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Optional: pin push keys (otherwise generated into `data/push.json`) |

## Deploy (Render)

`render.yaml` describes the whole setup: an always-on Starter web service in Ohio with a 1 GB disk mounted at `data/`.

1. Push this repo to GitHub (private is fine).
2. On [render.com](https://render.com): **New + → Blueprint**, connect GitHub, pick the repo.
3. Fill in `CONTACT` (required by Transitous). Leave the API keys blank until you have them.
4. Deploy. The app is served at `https://toronto-move-XXXX.onrender.com` with HTTPS.

The build also makes the website version of the Expo app (`mobile/dist`), which the server shows at `/`. The older website stays at `/classic`, and the privacy policy is at `/privacy` (store listings need it; it shows your `CONTACT`). Locally: `npm --prefix mobile run build:web`, then restart `npm run dev`. Without a build, `/` shows the older website.

Every `git push` to `master` redeploys automatically. Add keys later under **Environment** in the Render dashboard; changing them restarts the app.

## Tests

```bash
npm test     # notifier logic + a live trip-reminder run; push API tests run when `npm run dev` is up
```

## Before going public / commercial

1. **Routing:** Transitous is free only for **open-source, non-commercial** apps, with roughly 720 trip plans per day before you must contact them. For a real launch, self-host [MOTIS](https://github.com/motis-project/motis) (same API; ~$25–60/mo server) and set `MOTIS_URL`.
2. **Map tiles:** currently OpenStreetMap's tile servers (fine for development). Switch to MapTiler, Stadia, Mapbox or self-hosted Protomaps for production.
3. **Flights:** check AeroDataBox plan limits; responses are cached for 5 minutes for all users.
4. Keep the data attributions in the footer (TTC, Metrolinx, Environment Canada, Transitous, OpenStreetMap).

## Layout

```
server/
  index.js          Express API
  web.js            website: Expo build at /, privacy page, sw.js and icons from public/
  planner.js        plan + rank a trip (used by the API and the notifier)
  push.js           Web Push subscriptions, watched trips, /api/push/*
  notifier.js       minute-by-minute weather / route / trip notification logic
  rank.js           itinerary scoring (weather, alerts, live delays)
  live.js           merges live TTC/GO predictions into schedule data
  cache.js          TTL cache, one upstream request per refresh window
  sources/          ttc, go, weather, flights, motis (routing/geocoding), gtfsrt decoder
public/             sw.js, icons, manifest, privacy.html, and the older website (index.html, app.js, styles.css)
mobile/             Expo app for iPhone, Android and web (see mobile/README.md); mobile/store/ has the store listing
```

### How the live matching works
TTC's live feed uses different trip IDs from its published schedule, so `live.js` matches each scheduled departure to the closest live prediction **at the same stop on the same route** (within 12 minutes). GO's trip IDs match the schedule, so those are matched exactly.

## Next ideas
- Deploy over HTTPS so phones can install it (it's already an installable PWA)
- Move `data/push.json` to a database once there are thousands of users
- Live traffic for the driving option (needs a paid provider)
