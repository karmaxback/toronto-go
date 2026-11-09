// Shapes returned by the Toronto Go server (server/rank.js, server/fares.js, server/index.js).

export type Place = { name: string; lat: number; lon: number; type?: string; kind?: string; detail?: string; distanceKm?: number | null; id?: string };

export type LegAlert = { id: string; header: string; effect: string | null; serious?: boolean };
export type AccessIssue = { station: string | null; kind: 'elevator' | 'escalator' | 'other'; header: string };

export type Leg = {
  mode: string;
  transit: boolean;
  bikeshare?: boolean;
  agency: string | null;
  route: string | null;
  routeName?: string | null;
  color: string | null;
  textColor?: string | null;
  headsign?: string | null;
  from: { name: string; lat: number; lon: number; track?: string | null };
  to: { name: string; lat: number; lon: number; track?: string | null };
  start: string;
  end: string;
  durationMin: number;
  distanceM: number | null;
  stops?: number | null;
  live: { time: string; delayMin: number } | null;
  geometry: { points: string; precision: number } | null;
  line?: [number, number][];
  alerts: LegAlert[];
  access?: AccessIssue[];
  serious: boolean;
};

export type FareItem = { label: string; amount: number | null; note?: string };
export type Fare = { total: number; complete: boolean; rider?: string; items: FareItem[]; note?: string };

export type BikeShareInfo = {
  from: { name: string; distanceM: number; bikes: number; ebikes: number };
  to: { name: string; distanceM: number; docks: number };
  alternatives?: { from: { name: string; bikes: number; distanceM: number }[] };
};

export type Option = {
  kind: 'transit' | 'walk' | 'bike' | 'car' | 'bikeshare';
  start: string;
  end: string;
  durationMin: number;
  transfers: number;
  walkMin: number;
  legs: Leg[];
  live: boolean;
  tags?: string[];
  warnings?: string[];
  accessIssues?: AccessIssue[];
  fare?: Fare | null;
  bikeshare?: BikeShareInfo;
  approximate?: boolean;
};

export type PlanResult = {
  options: Option[];
  weather: { impact: { notes: string[] } };
};

export type Departure = {
  route: string;
  headsign: string;
  mode: string;
  agency: string;
  color: string | null;
  textColor: string | null;
  time: string;
  live: boolean;
  delayMin: number;
  track: string | null;
};
export type NearbyBoard = { stopId: string; name: string; lat: number; lon: number; distanceM: number; departures: Departure[] };

export type Vehicle = { id: string; route: string | null; lat: number; lon: number; bearing: number | null; occupancy: string | null };
export type VehiclesData = { ttc: Vehicle[]; go: Vehicle[] };

export type BikeStation = { id: string; name: string; lat: number; lon: number; bikes: number; ebikes: number; docks: number; distanceM?: number };

export type WeatherAlert = { id: string; name: string; severity: 'minor' | 'moderate' | 'severe'; area: string | null; text: string; type: string | null };
export type WeatherData = {
  current: {
    condition: string; temperature: number; feelsLike: number; windKmh: number | null; gustKmh: number | null;
    windDir: string | null; humidity: number | null; forecasts: { period: string; summary: string }[];
  } | null;
  alerts: WeatherAlert[];
};

export type TransitAlert = { id: string; source: string; header: string; description: string; routes: string[]; activeNow: boolean; effect: string | null };
export type AlertsData = { transit: TransitAlert[]; weather: WeatherAlert[]; accessibility: (AccessIssue & { id: string })[] };

export type Flight = {
  number: string; airline: string | null; status: string | null; city: string | null; airport: string | null;
  terminal: string | null; gate: string | null; scheduled: string | null; estimated: string | null; delayMin: number | null;
};
export type AirportData = {
  flightsEnabled: boolean;
  flights: { arrivals: Flight[]; departures: Flight[]; updated: string } | null;
  flightsError: string | null;
  upExpress: { fromPearson: { time: string; live: boolean }[]; fromUnion: { time: string; live: boolean }[] };
  terminals: Record<'T1' | 'T3', Place>;
};
