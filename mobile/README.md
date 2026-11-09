# Toronto Move: iPhone, Android and web app

One React Native + Expo (SDK 58) codebase builds the **iPhone app, Android app and website**. It talks to the Toronto Move server in the folder above (`../server`), which does the live TTC/GO/weather/fare work.

## Screens
| Tab | What it does |
|---|---|
| **Plan** | From/to search (addresses, shops, intersections, stops), 📍 my location, saved Home/Work and recent places, **Leave now / Depart at / Arrive by** (day + time), preference, fare type, step-free, intercity coaches; route options with live times, fares, Bike Share, elevator warnings, step-by-step directions; **Share trip** link; **🔔 Watch this trip**; "Next way home" card (uses your start point if location is off). Map: **live TTC vehicles** and **Bike Share** layers, long-press for Start here / Go here / Departures. Weather warning banner. |
| **Nearby** | Live departures from stops within 450 m and Bike Share stations with bike/dock counts. Starts at your location, Home or downtown; search any place; long-press the map. |
| **Airport** | Route to Pearson T1/T3, UP Express departures, flights board (when the server has a flight key). |
| **Alerts** | Weather and forecast, TTC elevator/escalator outages, transit service alerts. |
| **Settings** | Notifications (weather level, followed routes, watched trips, test), Home/Work and recent places, trip preferences (route choice, fare type, step-free, coaches), which other ways to suggest (Bike Share, cycling, driving), map layers, appearance (automatic/light/dark), 12/24-hour clock, auto-refresh, location access, privacy and support, reset. |

Shared links use the website format `https://<site>/?from=lat,lon,name&to=lat,lon,name`, so they open the website for anyone, and the app reads the same format.

Maps use Apple Maps (iPhone), Google Maps (Android) and OpenStreetMap/Leaflet (web): `src/components/map/transit-map.tsx` and `transit-map.web.tsx`.

## Try it on your phone with Expo Go
1. Install **Expo Go** from the App Store or Google Play.
2. On your computer, start the server (in the project folder): `npm run dev`
3. In another terminal: `cd mobile` then `npx expo start`
4. Scan the QR code: iPhone with the Camera app, Android with the Expo Go app.
   Your phone and computer must be on the **same Wi-Fi**. If Windows asks whether to allow Node.js on private networks, click **Allow**.

The app finds the server automatically (the computer's address, port 3000). To use the online server instead, create `mobile/.env` with:
```
EXPO_PUBLIC_API_URL=https://your-app.onrender.com
```

## Web version
`npx expo start --web` (opens on port 8081 and talks to the server on port 3000).
For the real website, `npm run build:web` writes `dist/`, which the server shows at `/` (Render does this on every deploy). Notifications only work there, not on port 8081.

## Look and feel
- One type scale (`TYPE` in `src/components/ui.tsx`: title 26, heading 17, body 15, small 13, caption 12) and one spacing scale (`SPACE`), used by every screen.
- Icons are Material Design Icons drawn with `react-native-svg` (`src/lib/icons.ts`, `src/components/icon.tsx`). The maps use the same icons: buses, streetcars, subways and GO trains on the live layer and at stops, bikes for Bike Share stations.
- Settings live in `src/lib/settings.ts` and are shared live by every screen.

## Icon, privacy policy and store listing
- Icon: `assets/images/*` and `assets/expo.icon` (iOS 26), made by `store/make-icons.mjs`.
- Privacy policy: served by the server at `/privacy` (source `../public/privacy.html`); linked from the Alerts tab.
- Store text, privacy answers and draft screenshots: `store/listing.md` and `store/screenshots/`.

## Checks
```
npx tsc --noEmit
npx expo lint
npx expo-doctor
```

## Notifications: what's needed before they work on phones
The code is complete (phones use Expo push, the website uses Web Push), but phones need:
1. An Expo account and EAS project: `npx eas-cli@latest init` (adds the project ID to app.json).
2. A **development build** (`eas build --profile development`): notifications can't run inside Expo Go.
3. Android: Firebase (FCM V1) credentials uploaded to EAS. iOS: push key, created by EAS during the build.
On the website they work once the Expo web build is served by the Toronto Move server over HTTPS.

## Not done yet
- **Store builds** with EAS (`eas build`, `eas submit`) and bundle IDs.
- **Final screenshots from the real app** (the drafts in `store/screenshots/` come from the website).
- **Opening shared https links directly in the installed app** (needs your own domain + app links).
- Before store submission, decide: open-source the code or self-host routing (Transitous allows open-source, non-commercial apps only).
