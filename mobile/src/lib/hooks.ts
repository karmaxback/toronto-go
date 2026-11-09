import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Load data now and every `intervalMs`. Reloads from scratch when `key` changes
 * (e.g. a new location). State is only updated in promise callbacks, never synchronously in effects.
 * `refresh()` is for pull-to-refresh and shows `refreshing` while it runs.
 */
export function usePolling<T>(fn: () => Promise<T>, intervalMs: number, key = '') {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });

  useEffect(() => {
    let alive = true;
    const load = () => fnRef.current().then(
      (d) => { if (alive) { setData(d); setError(null); } },
      (e: Error) => { if (alive) setError(e.message); },
    );
    load();
    const t = intervalMs ? setInterval(load, intervalMs) : undefined;
    return () => { alive = false; if (t) clearInterval(t); };
  }, [key, intervalMs]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    return fnRef.current()
      .then((d) => { setData(d); setError(null); }, (e: Error) => setError(e.message))
      .finally(() => setRefreshing(false));
  }, []);

  return { data, error, refreshing, refresh, loading: data === null && error === null };
}

/** Current time as state, ticking every `ms` (keeps render pure). */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
