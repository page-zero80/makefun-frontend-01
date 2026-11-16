// The shell: one persistent header, footer and view container. A route change
// loads its data, then either updates the view already on screen or replaces
// only the view. window.__shotReady is false while a route loads and true once
// its data is rendered, so a screenshot script knows when to capture.

import { cacheSummary, getBoardBounty, getBounties, getBounty, getLeaderboard, getProfile, subscribeCache } from './api.js';
import { parseRoute } from './router.js';
import { el, emptyPanel } from './ui.js';
import { timeLeftLabel } from './format.js';
import { createBoardView } from './views/board.js';
import { createBountyView } from './views/bounty.js';
import { createLeaderboardView } from './views/leaderboard.js';
import { createProfileView } from './views/profile.js';

const viewRoot = document.getElementById('view');
const cacheNode = document.querySelector('[data-cache]');
const updatedNode = document.querySelector('[data-updated]');
const navLinks = [...document.querySelectorAll('[data-nav]')];

let active = null;
let navSequence = 0;
let lastRenderedKey = null;

window.__shotReady = false;
history.scrollRestoration = 'manual';

function setNav(route) {
  const onWinners = route.kind === 'board' && route.params.get('view') === 'resolved';
  for (const link of navLinks) {
    const name = link.dataset.nav;
    const current = name === 'winners' ? onWinners : !onWinners && name === 'board';
    if (current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

function titleFor(route, data) {
  if (route.kind === 'board') return 'The bounty board · make.fun';
  if (route.kind === 'bounty') return `${data?.title || route.slug} · make.fun`;
  if (route.kind === 'leaderboard') {
    const name = data?.competition?.title || route.slug;
    return `Leaderboard · ${name} · make.fun`;
  }
  if (route.kind === 'profile') return `@${data?.handle || route.handle} · make.fun`;
  return 'make.fun';
}

async function loadRoute(route) {
  if (route.kind === 'board') {
    const data = await getBounties();
    if (!Array.isArray(data?.items)) throw new Error('The board answer had no bounties.');
    return data;
  }
  if (route.kind === 'bounty') {
    // Coming from the board, the row already has the full brief, prize table
    // and dates. Paint it from memory; the detail answer enriches it after.
    const preview = getBoardBounty(route.slug);
    if (preview) return preview;
    try {
      return await getBounty(route.slug, { attempts: 1 });
    } catch (error) {
      if (error?.status !== 404 && error?.status !== 503) throw error;
      const board = await getBounties().catch(() => null);
      const item = board?.items?.find((bounty) => bounty.slug === route.slug);
      if (item) return { ...item, __fromBoard: true };
      throw error;
    }
  }
  if (route.kind === 'leaderboard') {
    const phase = route.params.get('phase') === 'final' ? 'final' : '';
    try {
      return await getLeaderboard(route.slug, { phase });
    } catch (error) {
      // A bounty with no judged entries can 404 its leaderboard. That is an
      // empty state, not a missing bounty: load the bounty for its title and
      // render the same page with no rows.
      if (error?.status !== 404) throw error;
      try {
        const bounty = await getBounty(route.slug);
        return {
          competition: bounty,
          phase: {},
          entries: [],
          rest: [],
        };
      } catch {
        throw error;
      }
    }
  }
  if (route.kind === 'profile') return getProfile(route.handle);
  return null;
}

function factoryFor(route) {
  if (route.kind === 'board') return createBoardView;
  if (route.kind === 'bounty') return createBountyView;
  if (route.kind === 'leaderboard') return createLeaderboardView;
  if (route.kind === 'profile') return createProfileView;
  return null;
}

function mount(route, data) {
  const same = active?.key === route.key && typeof active.view?.update === 'function';
  if (same) {
    active.view.update(data, route);
  } else {
    if (active?.view?.destroy) active.view.destroy();
    const factory = factoryFor(route);
    const view = factory(data, route);
    viewRoot.replaceChildren(view.root);
    active = { key: route.key, kind: route.kind, view };
  }
  if (lastRenderedKey !== route.key) window.scrollTo(0, 0);
  lastRenderedKey = route.key;
  document.title = titleFor(route, data);
}

function statePage(kicker, title, body, actions = []) {
  return el('div', { class: 'state-page' }, emptyPanel({ kicker, title, body, actions }));
}

function showError(route, error) {
  active = null;
  lastRenderedKey = null;
  const status = error?.status;
  const label =
    route.kind === 'profile'
      ? `@${route.handle}`
      : route.kind === 'bounty' || route.kind === 'leaderboard'
        ? route.slug
        : 'This page';

  if (status === 404) {
    const title =
      route.kind === 'profile'
        ? `No public profile for @${route.handle}.`
        : `No bounty found at “${label}”.`;
    viewRoot.replaceChildren(
      statePage('Not found', title, 'The address may be misspelled, or the account or bounty may no longer be public.', [
        el('a', { class: 'text-link', href: '#/' }, 'Go to the board →'),
      ]),
    );
    document.title = 'Not found · make.fun';
    return;
  }

  const retry = el(
    'button',
    {
      class: 'btn btn--inline',
      type: 'button',
      onclick: () => renderRoute(),
    },
    'Try again',
  );
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

function initialCopy(route) {
  if (route.kind === 'bounty') return ['Bounty', 'Reading this bounty from make.fun…'];
  if (route.kind === 'leaderboard') return ['Standings', 'Reading this leaderboard from make.fun…'];
  if (route.kind === 'profile') return ['Public profile', 'Reading this account from make.fun…'];
  if (route.kind === 'board') return ['The bounty board', 'Reading make.fun’s public bounties…'];
  return ['make.fun', 'Opening…'];
}

/** A board preview paints immediately; the full detail answer swaps in after. */
function enrichBounty(route, sequence) {
  getBounty(route.slug)
    .then((fresh) => {
      if (sequence !== navSequence || active?.key !== route.key) return;
      if (!fresh?.slug || fresh.slug !== route.slug) return;
      const view = createBountyView(fresh, route);
      active = { key: route.key, kind: route.kind, view };
      viewRoot.replaceChildren(view.root);
      document.title = titleFor(route, fresh);
    })
    .catch(() => {
      // The board preview is already a complete page; a failed enrichment
      // must not turn it into an error.
    });
}

async function renderRoute() {
  const sequence = ++navSequence;
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
    const data = await loadRoute(route);
    if (sequence !== navSequence) return;
    const enrich = route.kind === 'bounty' && data === getBoardBounty(route.slug);
    mount(route, data);
    if (enrich) enrichBounty(route, sequence);
  } catch (error) {
    if (sequence !== navSequence) return;
    showError(route, error);
  } finally {
    if (sequence === navSequence) {
      document.body.dataset.loading = 'false';
      updateFooter();
      window.__shotReady = true;
    }
  }
}

function updateFooter() {
  if (cacheNode) cacheNode.textContent = cacheSummary();
  if (updatedNode) {
    const last = subscribeCache.lastUpdated;
    updatedNode.textContent = last ? `updated ${last.slice(11, 16)} UTC` : '';
  }
}

// A first paint before the route's answer arrives, so a cold load never sits
// on a blank page while make.fun answers.
const firstRoute = parseRoute();
const [firstKicker, firstText] = initialCopy(firstRoute);
viewRoot.replaceChildren(
  el(
    'div',
    { class: 'initial-load' },
    el('p', { class: 'kicker' }, firstKicker),
    el('p', { class: 'initial-text' }, firstText),
  ),
);

subscribeCache((stats) => {
  subscribeCache.lastUpdated = stats.lastUpdated;
  updateFooter();
});

window.addEventListener('hashchange', renderRoute);
if (!location.hash) history.replaceState(null, '', '#/');
renderRoute();

// Time left is patched in place; the rest of a view is never rebuilt for it.
function tickCountdowns() {
  for (const node of document.querySelectorAll('[data-countdown]')) {
    const iso = node.dataset.countdown;
    if (!iso) continue;
    const next = timeLeftLabel(iso);
    if (node.textContent !== next) node.textContent = next;
    node.classList.toggle('is-expired', next === 'Closed');
  }
}
setInterval(tickCountdowns, 30_000);
