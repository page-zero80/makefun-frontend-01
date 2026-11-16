// The shell: one persistent header, footer and view container. A route change
// loads its data, then either patches the view on screen or replaces it. The
// shell, API and formatters are the first load; every view arrives with a
// literal import() and is cached after its first use.

import { cacheSummary, getBoardBounty, getBounty, subscribeCache } from './api.js';
import { el, emptyPanel, parseRoute, timeLeftLabel } from './core.js';

const viewRoot = document.getElementById('view');
const cacheNode = document.querySelector('[data-cache]');
const updatedNode = document.querySelector('[data-updated]');
const navLinks = [...document.querySelectorAll('[data-nav]')];
const LOADING = {
  board: ['The bounty board', 'Reading make.fun’s public bounties…'],
  bounty: ['Bounty', 'Reading this bounty from make.fun…'],
  leaderboard: ['Standings', 'Reading this leaderboard from make.fun…'],
  profile: ['Public profile', 'Reading this account from make.fun…'],
};

let active = null;
let sequence = 0;
let lastKey = null;
let viewsCss;
let boardView;
let bountyView;
let leaderboardView;
let profileView;

window.__shotReady = false;
history.scrollRestoration = 'manual';

function loadCss() {
  return (viewsCss ||= import('./views-css.js'));
}

function moduleFor(kind) {
  if (kind === 'board') return (boardView ||= import('./views/board.js'));
  const css = loadCss();
  const view =
    kind === 'bounty'
      ? (bountyView ||= import('./views/bounty.js'))
      : kind === 'leaderboard'
        ? (leaderboardView ||= import('./views/leaderboard.js'))
        : (profileView ||= import('./views/profile.js'));
  return Promise.all([view, css]).then(([loaded]) => loaded);
}

function setNav(route) {
  const winners = route.kind === 'board' && route.params.get('view') === 'resolved';
  for (const link of navLinks) {
    const current = link.dataset.nav === 'winners' ? winners : !winners && link.dataset.nav === 'board';
    if (current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

function mount(route, data, module) {
  if (active?.key === route.key && typeof active.view?.update === 'function') {
    active.view.update(data, route);
  } else {
    const view = module.create(data, route);
    viewRoot.replaceChildren(view.root);
    active = { key: route.key, view };
  }
  if (lastKey !== route.key) window.scrollTo(0, 0);
  lastKey = route.key;
  document.title = module.title(data, route);
}

function statePage(kicker, title, body, actions = []) {
  return el('div', { class: 'state-page' }, emptyPanel({ kicker, title, body, actions }));
}

function showError(route, error) {
  active = null;
  lastKey = null;
  const status = error?.status;
  const label = route.kind === 'profile' ? `@${route.handle}` : route.kind === 'bounty' || route.kind === 'leaderboard' ? route.slug : 'This page';

  if (status === 404) {
    const title = route.kind === 'profile' ? `No public profile for @${route.handle}.` : `No bounty found at “${label}”.`;
    viewRoot.replaceChildren(
      statePage('Not found', title, 'The address may be misspelled, or the account or bounty may no longer be public.', [
        el('a', { class: 'text-link', href: '#/' }, 'Go to the board →'),
      ]),
    );
    document.title = 'Not found · make.fun';
    return;
  }

  const retry = el('button', { class: 'btn btn--inline', type: 'button' }, 'Try again');
  retry.addEventListener('click', render);
  const message =
    status === 503 || error?.code === 'board_pending'
      ? 'make.fun is rebuilding this board page right now. It usually takes a few seconds.'
      : error?.message || 'make.fun could not answer this request.';
  viewRoot.replaceChildren(
    statePage('Could not load', 'The board is quiet for a moment.', message, [
      retry,
      el('a', { class: 'text-link', href: '#/' }, 'Back to the board →'),
    ]),
  );
  document.title = 'Could not load · make.fun';
}

/** A board preview paints at once; the full detail answer swaps in after. */
function enrich(route, ticket, module) {
  getBounty(route.slug)
    .then((fresh) => {
      if (ticket !== sequence || active?.key !== route.key || fresh?.slug !== route.slug) return;
      const view = module.create(fresh, route);
      active = { key: route.key, view };
      viewRoot.replaceChildren(view.root);
      document.title = module.title(fresh, route);
    })
    .catch(() => {});
}

async function render() {
  const ticket = ++sequence;
  window.__shotReady = false;
  document.body.dataset.loading = 'true';
  const route = parseRoute();
  setNav(route);

  if (route.kind === 'notfound') {
    active = null;
    viewRoot.replaceChildren(
      statePage('404', 'That address is not a surface here.', 'The board, a bounty, its leaderboard and a profile are the four pages this front end serves.', [
        el('a', { class: 'text-link', href: '#/' }, 'Go to the board →'),
      ]),
    );
    document.title = 'Not found · make.fun';
    document.body.dataset.loading = 'false';
    window.__shotReady = true;
    return;
  }

  try {
    const module = await moduleFor(route.kind);
    const data = await module.load(route);
    if (ticket !== sequence) return;
    mount(route, data, module);
    if (route.kind === 'bounty' && data === getBoardBounty(route.slug)) enrich(route, ticket, module);
  } catch (error) {
    if (ticket === sequence) showError(route, error);
  } finally {
    if (ticket === sequence) {
      document.body.dataset.loading = 'false';
      updateFooter();
      window.__shotReady = true;
    }
  }
}

function updateFooter() {
  if (cacheNode) cacheNode.textContent = cacheSummary();
  if (updatedNode) updatedNode.textContent = subscribeCache.lastUpdated ? `updated ${subscribeCache.lastUpdated.slice(11, 16)} UTC` : '';
}

const first = parseRoute();
const [kicker, copy] = LOADING[first.kind] || ['make.fun', 'Opening…'];
viewRoot.replaceChildren(el('div', { class: 'initial-load' }, el('p', { class: 'kicker' }, kicker), el('p', { class: 'initial-text' }, copy)));

subscribeCache(({ lastUpdated }) => {
  subscribeCache.lastUpdated = lastUpdated;
  updateFooter();
});

window.addEventListener('hashchange', render);
if (!location.hash) history.replaceState(null, '', '#/');
render();

function tick() {
  for (const node of document.querySelectorAll('[data-countdown]')) {
    const iso = node.dataset.countdown;
    if (!iso) continue;
    const next = timeLeftLabel(iso);
    if (node.textContent !== next) node.textContent = next;
    node.classList.toggle('is-expired', next === 'Closed');
  }
}
setInterval(tick, 30_000);
