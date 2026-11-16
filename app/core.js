
const NUM = new Intl.NumberFormat('en-US');
const DM = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const TU = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
}

export function num(value) {
  return Number.isFinite(Number(value)) ? NUM.format(Number(value)) : '—';
}

export function plural(count, singular, many = `${singular}s`) {
  return `${num(count)} ${Number(count) === 1 ? singular : many}`;
}

export function parseDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function deadlineShort(iso) {
  const d = parseDate(iso);
  return d ? `${DM.format(d)} · ${TU.format(d)} UTC` : '—';
}

export function timeLeftLabel(iso, now = Date.now()) {
  const d = parseDate(iso);
  if (!d) return '—';
  const ms = d.getTime() - now;
  if (ms <= 0) return 'Closed';
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), days = Math.floor(h / 24);
  const text = days ? `${days}d ${h % 24}h` : h ? `${h}h ${m % 60}m` : m ? `${m}m` : '<1m';
  return `${text} left`;
}

export function bountyState(bounty, now = Date.now()) {
  const status = bounty?.status;
  if (status === 'resolved' || bounty?.resolvedAt) return { key: 'resolved', label: 'Resolved', full: 'Results published' };
  if (status === 'open') {
    const deadline = parseDate(bounty?.deadline);
    return !deadline || deadline.getTime() > now
      ? { key: 'live', label: 'Open', full: 'Accepting entries' }
      : { key: 'closed', label: 'Closed', full: 'Entries closed, awaiting results' };
  }
  if (status === 'closed') return { key: 'closed', label: 'Closed', full: 'Entries closed, awaiting results' };
  if (status === 'draft') return { key: 'draft', label: 'Draft', full: 'Not published' };
  const label = titleCase(status || 'Unknown');
  return { key: status || 'unknown', label, full: label };
}

function titleCase(value) {
  return String(value ?? '').replace(/(^|[\s-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
}

function truncate(value, length = 180) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text;
}

export function deckLine(value, title, length = 0) {
  let text = String(value ?? '').replace(/[#*_`>]/g, '').replace(/\s+/g, ' ').trim();
  const prefix = String(title ?? '').trim();
  if (prefix && text.toLowerCase().startsWith(`${prefix.toLowerCase()}:`)) {
    text = text.slice(prefix.length + 1).trim();
    if (text) text = text[0].toUpperCase() + text.slice(1);
  }
  return length ? truncate(text, length) : text;
}

export function el(tag, attrs = null, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key === 'class') node.className = value;
      else node.setAttribute(key, value === true ? '' : String(value));
    }
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function replace(node, ...children) {
  node.replaceChildren(...children.flat(Infinity).filter((child) => child != null && child !== false));
  return node;
}

export function setText(node, text) {
  if (node) node.textContent = text == null ? '' : String(text);
}

export function apiAssetUrl(url) {
  if (!url || typeof url !== 'string' || url.startsWith('data:')) return null;
  return /^https?:\/\//i.test(url) ? url : `https://make.fun${url.startsWith('/') ? '' : '/'}${url}`;
}

export function apiImage(url, attrs = {}) {
  const src = apiAssetUrl(url);
  if (!src) return null;
  const img = el('img', { crossorigin: 'anonymous', alt: attrs.alt ?? '', class: attrs.class, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
  if (attrs.fail) img.addEventListener('error', attrs.fail, { once: true });
  img.src = src;
  return img;
}

export function emptyPanel({ kicker = '', title, body, actions = [] }) {
  return el(
    'section',
    { class: 'empty-panel' },
    kicker ? el('p', { class: 'kicker' }, kicker) : null,
    el('h2', { class: 'empty-title' }, title),
    body ? el('p', { class: 'empty-body' }, body) : null,
    actions.length ? el('div', { class: 'empty-actions' }, ...actions) : null,
  );
}

function safeDecode(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

export function parseRoute(hash = location.hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const at = raw.indexOf('?');
  const params = new URLSearchParams(at >= 0 ? raw.slice(at + 1) : '');
  const parts = (at >= 0 ? raw.slice(0, at) : raw).split('/').filter(Boolean).map(safeDecode);

  if (!parts.length) return { kind: 'board', params, key: 'board' };
  if (parts[0] === 'bounty' && parts[1]) {
    if (parts.length === 2) return { kind: 'bounty', slug: parts[1], params, key: `bounty:${parts[1]}` };
    if (parts.length === 3 && parts[2] === 'leaderboard') {
      const phase = params.get('phase') === 'final' ? ':final' : '';
      return { kind: 'leaderboard', slug: parts[1], params, key: `leaderboard:${parts[1]}${phase}` };
    }
  }
  if (parts[0] === 'u' && parts.length === 2) return { kind: 'profile', handle: parts[1], params, key: `profile:${parts[1]}` };
  return { kind: 'notfound', params, key: `notfound:${raw}` };
}

export function replaceHash(hash) {
  if (location.hash !== hash) history.replaceState(null, '', hash);
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

export const profileHash = (handle) => `#/u/${encodeURIComponent(handle)}`;
export const bountyHash = (slug) => `#/bounty/${encodeURIComponent(slug)}`;
