/**
 * Tiny TTL cache with in-flight de-duplication, so many users hitting the app
 * at once still cause only one upstream request per feed per refresh window.
 * If a refresh fails, the last good value is served (marked stale) for up to `staleFor`.
 */
const store = new Map();

export async function cached(key, ttlMs, loader, { staleFor = 10 * 60_000 } = {}) {
  const now = Date.now();
  const entry = store.get(key);
  if (entry?.value !== undefined && now - entry.at < ttlMs) return entry.value;
  if (entry?.pending) return entry.pending;

  const pending = (async () => {
    try {
      const value = await loader();
      store.set(key, { value, at: Date.now() });
      return value;
    } catch (err) {
      if (entry?.value !== undefined && now - entry.at < ttlMs + staleFor) {
        store.set(key, { ...entry, pending: undefined });
        console.warn(`[cache] ${key} refresh failed, serving stale: ${err.message}`);
        return entry.value;
      }
      store.delete(key);
      throw err;
    }
  })();
  store.set(key, { ...entry, pending });
  return pending;
}
