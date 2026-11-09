const env = process.env;

export const config = {
  port: Number(env.PORT) || 3000,
  contact: (env.CONTACT || '').trim(),
  motisUrl: (env.MOTIS_URL || 'https://api.transitous.org').replace(/\/+$/, ''),
  metrolinxKey: (env.METROLINX_API_KEY || '').trim(),
  aeroDataBoxKey: (env.AERODATABOX_RAPIDAPI_KEY || '').trim(),
};

export const userAgent = `TorontoMove/0.1 (${config.contact || 'contact not configured'})`;

/** fetch with a timeout and our User-Agent. Throws on non-2xx. */
export async function http(url, { timeout = 20000, headers = {}, as = 'json' } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': userAgent, ...headers },
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) {
    const err = new Error(`${res.status} ${res.statusText} from ${new URL(url).host}`);
    err.status = res.status;
    throw err;
  }
  if (as === 'buffer') return new Uint8Array(await res.arrayBuffer());
  if (as === 'text') return res.text();
  return res.json();
}
