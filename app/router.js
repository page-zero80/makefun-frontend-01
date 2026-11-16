// Hash routes. Each surface has its own address and survives a cold load:
//   #/                              the board
//   #/?view=resolved&sort=pot       the board, filtered and sorted
//   #/bounty/<slug>                 one bounty
//   #/bounty/<slug>/leaderboard     that bounty's standings (optionally ?page=2)
//   #/u/<handle>                    an account's public profile

function safeDecode(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

export function parseRoute(hash = location.hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const queryAt = raw.indexOf('?');
  const path = queryAt >= 0 ? raw.slice(0, queryAt) : raw;
  const params = new URLSearchParams(queryAt >= 0 ? raw.slice(queryAt + 1) : '');
  const parts = path.split('/').filter(Boolean).map(safeDecode);

  if (!parts.length) return { kind: 'board', params, key: 'board' };

  if (parts[0] === 'bounty' && parts.length === 2 && parts[1]) {
    return { kind: 'bounty', slug: parts[1], params, key: `bounty:${parts[1]}` };
  }
  if (parts[0] === 'bounty' && parts.length === 3 && parts[1] && parts[2] === 'leaderboard') {
    // The phase is part of the key: switching phases fetches a different board
    // and mounts a fresh view over the same page.
    const phase = params.get('phase') === 'final' ? ':final' : '';
    return { kind: 'leaderboard', slug: parts[1], params, key: `leaderboard:${parts[1]}${phase}` };
  }
  if (parts[0] === 'u' && parts.length === 2 && parts[1]) {
    return { kind: 'profile', handle: parts[1], params, key: `profile:${parts[1]}` };
  }
  return { kind: 'notfound', params, key: `notfound:${path}` };
}

/** Replace the address without adding a history entry or a hashchange event. */
export function replaceHash(hash) {
  if (location.hash === hash) return;
  history.replaceState(null, '', hash);
}

export function boardHash({ view = 'live', sort = 'ending', page = 1 } = {}) {
  const params = new URLSearchParams();
  if (view && view !== 'all') params.set('view', view);
  if (sort && sort !== 'ending') params.set('sort', sort);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return `#/${query ? `?${query}` : ''}`;
}

export function leaderboardHash(slug, page = 1, phase = '') {
  const params = new URLSearchParams();
  if (phase) params.set('phase', phase);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return `#/bounty/${encodeURIComponent(slug)}/leaderboard${query ? `?${query}` : ''}`;
}

export function profileHash(handle) {
  return `#/u/${encodeURIComponent(handle)}`;
}

export function bountyHash(slug) {
  return `#/bounty/${encodeURIComponent(slug)}`;
}
