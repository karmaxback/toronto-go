import { useEffect, useState } from 'react';

import { api } from './api';
import type { WeatherData } from './types';

// One shared weather fetch for the whole app (chip, banner and Alerts tab all read it).
let cache: { at: number; data: WeatherData } | null = null;
let inflight: Promise<WeatherData> | null = null;
const listeners = new Set<(d: WeatherData) => void>();
const TTL = 5 * 60_000;

function fetchWeather() {
  if (cache && Date.now() - cache.at < TTL) return Promise.resolve(cache.data);
  inflight ??= api.weather()
    .then((d) => { cache = { at: Date.now(), data: d }; listeners.forEach((l) => l(d)); return d; })
    .finally(() => { inflight = null; });
  return inflight;
}

/** Fetch fresh weather now (pull to refresh); every screen using useWeather updates. */
export function refreshWeather() {
  cache = null;
  return fetchWeather();
}

export function useWeather() {
  const [data, setData] = useState<WeatherData | null>(cache?.data ?? null);
  useEffect(() => {
    listeners.add(setData);
    fetchWeather().then(setData, () => {});
    const t = setInterval(() => { fetchWeather().catch(() => {}); }, TTL);
    return () => { listeners.delete(setData); clearInterval(t); };
  }, []);
  return data;
}
