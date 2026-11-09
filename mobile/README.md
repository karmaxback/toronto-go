# Toronto Go: iPhone, Android and web app

One React Native + Expo (SDK 58) codebase builds the **iPhone app, Android app and website**. It talks to the Toronto Go server in the folder above (`../server`), which does the live TTC/GO/weather/fare work.

## Screens
| Tab | What it does |
|---|---|
| **Plan** | From/to search, saved Home/Work, recent places, preference (best/fastest/fewer transfers/less walking), fare type, step-free mode, route options with live times, fares, Bike Share, elevator warnings, step-by-step directions, map. "Next way home" card when Home is saved. Long-press the map to start or end there. |
| **Nearby** | Live departures from stops within 450 m and Bike Share stations with bike/dock counts. Long-press the map to look elsewhere. |
| **Airport** | Route to Pearson T1/T3, UP Express departures, flights board (when the server has a flight key). |
| **Alerts** | Weather, forecast and warnings, TTC elevator/escalator outages, transit service alerts. |

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

## Checks
```
npx tsc --noEmit
npx expo lint
npx expo-doctor
```

## Not done yet
- **Push notifications** in the native apps (needs a *development build*, not Expo Go).
- **App icon and splash screen** (still the Expo template images).
- **Store builds** with EAS (`eas build`, `eas submit`), bundle IDs, privacy policy, screenshots.
- **Serving the Expo web build** from the server instead of the older `public/` web app.
- Before store submission, decide: open-source the code or self-host routing (Transitous allows open-source, non-commercial apps only), and confirm the app name.
