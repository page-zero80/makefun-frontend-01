// make.fun's public API, read-only and same for every caller.
//
// Answers stay in memory for a minute, then revalidate with If-None-Match: a

const ORIGIN = 'https://make.fun';
const TTL_MS = 60_000;
const MAX_ENTRIES = 20;
const listeners = new Set();
const memory = new Map();
let boardItems = null;

const stats = { requests: 0, network: 0, revalidated: 0, notModified: 0, memoryHits: 0, stale: 0, errors: 0, lastUpdated: null };

class ApiError extends Error {
  constructor(message, { status = 0, code = '', retryAfter = 0 } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export function subscribeCache(listener) {
  listeners.add(listener);
  listener({ lastUpdated: stats.lastUpdated });
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of listeners) {
    try { listener({ lastUpdated: stats.lastUpdated }); } catch { /* never break a view */ }
  }
}

function trimMemory() {
  if (memory.size <= MAX_ENTRIES) return;
  for (const [key, entry] of memory) {
    if (entry.inflight) continue;
    memory.delete(key);
    if (memory.size <= MAX_ENTRIES) break;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorBody(body) {
  if (!body || typeof body !== 'object') return null;
  return {
    message: body.detail || body.title || (Array.isArray(body.error) ? body.error[0]?.message : '') || '',
    code: body.code || '',
  };
}

async function request(path, { ifNoneMatch, attempts = 5 } = {}) {
  const accept = { Accept: 'application/json' };
  let conditional = Boolean(ifNoneMatch);
  let etag = ifNoneMatch;

  for (let attempt = 0; ; attempt++) {
    const headers = conditional ? { ...accept, 'If-None-Match': etag } : accept;
    let response;
    try {
      response = await fetch(ORIGIN + path, { method: 'GET', headers, credentials: 'omit', mode: 'cors' });
    } catch {
      if (conditional) {
        conditional = false;
        try {
          response = await fetch(ORIGIN + path, { method: 'GET', headers: accept, credentials: 'omit', mode: 'cors' });
        } catch {
          throw new ApiError('Could not reach make.fun. Check your connection and try again.', { status: 0 });
        }
      } else {
        throw new ApiError('Could not reach make.fun. Check your connection and try again.', { status: 0 });
      }
    }

    if (response.status === 503 && attempt < attempts) {
      const retryAfter = Number(response.headers.get('Retry-After'));
      await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(8, retryAfter) * 1000 : Math.min(5, attempt + 1) * 1000);
      continue;
    }
    return response;
  }
}

async function apiGet(path, { force = false, attempts = 5 } = {}) {
  const cached = memory.get(path);
  const fresh = cached?.data !== undefined && Date.now() - cached.at < TTL_MS;

  if (!force && fresh) {
    stats.memoryHits++;
    emit();
    return cached.data;
  }
  if (cached?.inflight) return cached.inflight;

  const entry = { ...(cached || {}) };
  const promise = (async () => {
    stats.requests++;
    if (entry.etag) stats.revalidated++;
    const response = await request(path, { ifNoneMatch: entry.etag, attempts });

    if (response.status === 304 && entry.data !== undefined) {
      entry.at = Date.now();
      entry.inflight = null;
      const etag = response.headers.get('etag');
      if (etag) entry.etag = etag;
      stats.notModified++;
      stats.lastUpdated = new Date().toISOString();
      emit();
      return entry.data;
    }

    if (!response.ok) {
      if (entry.data !== undefined && response.status >= 500) {
        entry.at = Date.now() - TTL_MS;
        entry.inflight = null;
        stats.stale++;
        emit();
        return entry.data;
      }
      let parsed = null;
      try { parsed = errorBody(await response.json()); } catch { /* non-JSON error */ }
      stats.errors++;
      emit();
      throw new ApiError(parsed?.message || `make.fun answered ${response.status}.`, {
        status: response.status,
        code: parsed?.code || '',
        retryAfter: Number(response.headers.get('Retry-After')) || 0,
      });
    }

    let data;
    try {
      data = await response.json();
    } catch {
      stats.errors++;
      emit();
      throw new ApiError('make.fun sent an answer this page could not read.', { status: response.status });
    }

    entry.data = data;
    entry.etag = response.headers.get('etag') || null;
    entry.at = Date.now();
    entry.inflight = null;
    trimMemory();
    stats.network++;
    stats.lastUpdated = new Date().toISOString();
    emit();
    return data;
  })();

  entry.inflight = promise;
  memory.set(path, entry);

  try {
    return await promise;
  } catch (error) {
    const current = memory.get(path);
    if (current?.inflight === promise) {
      if (current.data !== undefined) current.inflight = null;
      else memory.delete(path);
    }
    throw error;
  }
}

export function cacheSummary() {
  const parts = [];
  if (stats.network) parts.push(`${stats.network} API ${stats.network === 1 ? 'read' : 'reads'}`);
  if (stats.notModified) parts.push(`${stats.notModified} revalidated (304)`);
  if (stats.revalidated && !stats.notModified) parts.push(`${stats.revalidated} ETag ${stats.revalidated === 1 ? 'check' : 'checks'}`);
  if (stats.memoryHits) parts.push(`${stats.memoryHits} cache ${stats.memoryHits === 1 ? 'hit' : 'hits'}`);
  if (stats.stale) parts.push(`${stats.stale} kept from cache on error`);
  if (!parts.length) parts.push('Waiting for make.fun');
  parts.push(`${memory.size} ${memory.size === 1 ? 'answer' : 'answers'} in memory`);
  return parts.join(' · ');
}

/** The board: every public competition, with activity rows cut to their times. */
export function getBounties(options) {
  return apiGet('/api/competitions?activity=times', options).then((data) => {
    if (Array.isArray(data?.items)) boardItems = data.items;
    return data;
  });
}

/** A bounty already present in the board answer, if one has been read. */
export function getBoardBounty(slug) {
  return boardItems?.find((item) => item.slug === slug) || null;
}

/** One bounty, without its (often huge) list of entries. */
export function getBounty(slug, options) {
  return apiGet(`/api/competitions/${encodeURIComponent(slug)}?submissions=summary`, options);
}

/** A bounty's standings: ten whole rows, then light stubs. */
export function getLeaderboard(slug, { phase = '' } = {}) {
  const query = ['rows=first'];
  if (phase) query.push(`phase=${encodeURIComponent(phase)}`);
  return apiGet(`/api/competitions/${encodeURIComponent(slug)}/leaderboard?${query.join('&')}`);
}

/** An account's public profile. */
export function getProfile(handle) {
  return apiGet(`/api/profiles/${encodeURIComponent(handle)}`);
}
