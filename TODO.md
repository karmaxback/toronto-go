# Toronto Move: to do

Things only you can do (accounts, keys, payments). Tick them off as you go: change `[ ]` to `[x]`.
Never put keys in this file or anywhere on GitHub; they go in `.env` (on your computer) or in Render's
**Environment** settings.

## Keys

- [ ] **Google Places key** (backup search for shops and gyms missing from OpenStreetMap, e.g. Fit4Less at Lawrence & Morningside)
  1. Go to console.cloud.google.com and sign in with your Google account.
  2. Create a project and call it "Toronto Move".
  3. Set up **Billing** (a card is needed even for the free amount).
  4. Search for **Places API (New)** and click **Enable**.
  5. Go to **APIs & Services → Credentials → Create credentials → API key**.
  6. Click **Restrict key**, choose **Places API (New)**, and save.
  7. Optional: in **Billing → Budgets & alerts**, set a $1 budget so Google emails you if anything costs money.
  8. Put the key in `.env` on the line `GOOGLE_PLACES_API_KEY=`, and in Render's Environment settings.
  9. Ask Claude to check that "Fit4Less Lawrence Ave/Morningside Ave" now finds the gym.

  The app caps Google at 150 searches a day and 4,500 a month, inside Google's free 5,000.

- [ ] **Metrolinx key** (live GO Transit and UP Express times). Apply after moving to Toronto in December 2026:
  https://api.openmetrolinx.com/OpenDataAPI/Help/Registration/en. Approval takes up to 10 business days.
  Then add it as `METROLINX_API_KEY=`.

- [ ] **AeroDataBox key** (live Pearson arrivals and departures). Use the free "Basic" plan on RapidAPI:
  https://rapidapi.com/aedbx-aedbx/api/aerodatabox. Then add it as `AERODATABOX_RAPIDAPI_KEY=`.

## Going live

- [ ] **Render:** create the service from this GitHub repo (it reads `render.yaml`) and add the keys above.
- [ ] **Contact:** fill in `CONTACT=` (a website or email you're happy to share). It's shown on the privacy page and sent to the free data services.

## Phone apps (App Store / Google Play)

- [ ] Run `eas init` and make a development build, to test notifications on a real phone.
- [ ] Decide on store release. First check that the name "Toronto Move" is free in both stores, and
  the routing service's terms: the free Transitous service is for non-commercial use only.
