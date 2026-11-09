# Store listing: Toronto Move

Copy these into App Store Connect and the Google Play Console. Character limits are shown in brackets.
Before submitting: check the name is free in both stores (see "Name" below), set `CONTACT` on the server, and take final screenshots from the real app.

## Links (both stores)
- **Privacy policy URL:** `https://<your-server>/privacy`
- **Support URL:** `https://<your-server>/support`
  (`<your-server>` is the Render address, e.g. `toronto-move.onrender.com`, or your own domain later.)

## Name
- **App name** [30]: `Toronto Move`
  Avoids the GO Transit trademark. Search both stores for "Toronto Move" before submitting; if it's taken, `Toronto Move: Transit` also fits in 30.
  The subtitle and keywords say "transit", so people searching for moving companies aren't sent here by mistake.
- **iOS subtitle** [30]: `Live TTC, GO & UP Express`
- **Google Play short description** [80]: `Live TTC, GO, UP Express and Pearson trip planner with delay and weather alerts.`

## iOS promotional text [170]
Plan any Toronto trip with live TTC, GO and UP Express times, Bike Share, fares and weather. Get a nudge when it's time to leave, or when your route is delayed.

## Description [4000] (both stores)
Toronto Move plans the best way across Toronto and the GTA right now, using live transit, Bike Share and weather.

PLAN WITH LIVE TIMES
• Type an address, a shop, an intersection or a station; or use your location
• Compares subway, streetcar, bus, GO train and bus, UP Express, VIA, Bike Share, walking and driving
• Live departure times and delays from the TTC, so routes reflect what's actually running
• Leave now, depart at, or arrive by any day and time
• Ranked for Best, Fastest, Fewer transfers or Less walking
• Fares for adult, youth, senior and child, including PRESTO and the One Fare free transfer

GET THERE STEP-FREE
• Step-free / wheelchair option avoids stairs
• Warns you when an elevator on your route is out of service

KNOW BEFORE YOU GO
• Watch a trip: a reminder when it's time to leave, and an alert if your route is delayed or disrupted
• Environment Canada weather warnings, with routes adjusted for bad weather
• All TTC service alerts and elevator/escalator outages in one place

AROUND YOU
• Live departures from stops near you
• Bike Share stations with live bike and dock counts
• Live TTC buses and streetcars on the map

PEARSON AIRPORT
• One tap to route to Terminal 1 or 3
• UP Express departures in both directions

MORE
• Next way home: one tap from wherever you are
• Save Home and Work; recent places as shortcuts
• Share a trip as a link anyone can open

No account, no ads, no tracking.

Toronto Move is an independent app and is not affiliated with the TTC, Metrolinx, GO Transit, UP Express, Bike Share Toronto or the Greater Toronto Airports Authority. Transit data: TTC, Metrolinx, Bike Share Toronto. Weather: Environment and Climate Change Canada. Routing: Transitous. Maps and places © OpenStreetMap contributors.

## iOS keywords [100]
`ttc,transit,subway,streetcar,bus,go train,presto,up express,pearson,bike share,commute,trip planner`

## Category and rating
- **Apple:** Primary *Navigation*, secondary *Travel*. Age rating: answer "None" to everything, giving **4+**.
- **Google:** Category *Maps & Navigation*. Content rating questionnaire: no objectionable content, giving **Everyone**. Target audience: 18+ (avoids the extra rules for apps aimed at children).

## Apple "App Privacy" answers
- **Tracking:** No.
- **Data collected:** only **Location → Precise location**. Purpose: *App functionality*. Linked to the user: **No**. Used for tracking: **No**.
  This covers the start and end points of trips the user chooses to watch, which the server stores to send reminders.
  Location sent with a single search or trip request is used only to answer that request and isn't stored, which Apple doesn't count as "collected".
- Nothing else is collected: no contact info, identifiers for tracking, usage data, diagnostics or purchases.

## Google Play "Data safety" answers
- **Data collected:** *Location: Approximate location* and *Precise location*.
  - Collected, not shared (the routing and address-search services act on our behalf, which Google doesn't count as sharing).
  - Processed ephemerally: **No**, because watched trips are stored.
  - Required or optional: **Optional** (the app works with typed addresses).
  - Purpose: *App functionality*.
- **Encrypted in transit:** Yes (HTTPS).
- **Users can request deletion:** Yes (turning notifications off deletes everything; or contact us via the support page).
- **Device or other IDs:** No. The notification token isn't an advertising or device ID.

## Screenshots
Drafts are in `screenshots/`, taken from the website version at the exact store sizes:
- `iphone-6.9/` 1290 × 2796: the App Store's required 6.9" iPhone size.
- `android-phone/` 1080 × 2160: Google Play phone size.

The website shows the tabs at the top, while the phone apps have them at the bottom. Apple asks that screenshots show the actual app, so **retake the iPhone set from the development build** (on a phone, or Xcode's simulator via EAS) before submitting. The Android drafts are fine to start with, but real-app shots are better.

Good scenes to capture: a planned trip with live times, Nearby with Bike Share, a watched-trip reminder notification, the step-free elevator warning, and the Airport tab.

## Graphics
- `play-icon-512.png`: Google Play app icon (512 × 512).
- `play-feature-graphic.png`: Google Play feature graphic (1024 × 500).
- The App Store icon comes from the app build itself (`assets/expo.icon` and `assets/images/icon.png`).
- The icon generator is `make-icons.mjs` (see the comment at the top to rerun it).
