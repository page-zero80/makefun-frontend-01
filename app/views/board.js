// The board: every public bounty, filtered, sorted and paginated. One API read
// serves the whole view; filtering, sorting and paging patch only the list.
// API text is escaped before it enters the markup.

import { getBounties } from '../api.js';
import {
  apiAssetUrl,
  boardHash,
  bountyHash,
  bountyState,
  deadlineShort,
  deckLine,
  el,
  emptyPanel,
  esc,
  leaderboardHash,
  money,
  num,
  plural,
  profileHash,
  replaceHash,
  timeLeftLabel,
} from '../core.js';
import { chipMarkup } from './format.js';

const PAGE = 8;
const FILTERS = [['all', 'All'], ['live', 'Live'], ['closed', 'Closed'], ['resolved', 'Resolved']];

const readState = (params) => ({
  view: FILTERS.some(([key]) => key === params.get('view')) ? params.get('view') : 'all',
  sort: params.get('sort') === 'pot' ? 'pot' : 'ending',
  page: Math.max(1, Number.parseInt(params.get('page'), 10) || 1),
});

const potOf = (bounty) => Number(bounty.potUsd ?? bounty.rewardAmount) || 0;

function stateRank(bounty, now) {
  const key = bountyState(bounty, now).key;
  return key === 'live' ? 0 : key === 'closed' ? 1 : 2;
}

function sortRows(items, sort, now) {
  const rows = [...items];
  if (sort === 'pot') return rows.sort((a, b) => potOf(b) - potOf(a) || new Date(a.deadline) - new Date(b.deadline));
  return rows.sort((a, b) => {
    const rank = stateRank(a, now) - stateRank(b, now);
    if (rank) return rank;
    const [at, bt] = [new Date(a.deadline).getTime() || 0, new Date(b.deadline).getTime() || 0];
    return stateRank(a, now) === 0 ? at - bt : bt - at;
  });
}

function pageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const wanted = [...new Set([1, total, current - 1, current, current + 1])].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < wanted.length; i++) {
    if (i && wanted[i] - wanted[i - 1] > 1) out.push('…');
    out.push(wanted[i]);
  }
  return out;
}

function pageButton(page, text, attrs = {}) {
  return `<button class="page-btn${attrs.current ? ' is-current' : ''}" type="button" data-page="${page}" aria-label="${esc(attrs.label || `Page ${page}`)}"${attrs.current ? ' aria-current="page"' : ''}${attrs.disabled ? ' disabled' : ''}>${text}</button>`;
}

function rowMarkup(bounty, now) {
  const state = bountyState(bounty, now);
  const fee = bounty.entryFeeUsd == null ? null : Number(bounty.entryFeeUsd);
  const title = bounty.title || bounty.slug;
  const summary = deckLine(bounty.summary || bounty.description, bounty.title, 138);
  const winner = bounty.winner;
  const deadline =
    state.key === 'resolved'
      ? '<span class="r-value">Resolved</span>'
      : state.key === 'live'
        ? `<span class="r-value num" data-countdown="${esc(bounty.deadline)}">${esc(timeLeftLabel(bounty.deadline, now))}</span>`
        : '<span class="r-value">Closed</span>';
  const feeSub = fee && Number(bounty.entryFeesUsd) > 0 ? `${esc(money(bounty.entryFeesUsd))} in fees` : fee ? 'once per account' : 'no fee';
  const won =
    state.key === 'resolved' && winner?.handle
      ? `<span class="r-winner">Won by <a href="${esc(profileHash(winner.handle))}" class="inline-link">@${esc(winner.handle)}</a>${winner.amountUsd ? ` · ${esc(money(winner.amountUsd))}` : ''}</span>`
      : '';
  const entries = Number(bounty.submissionCount) || 0;
  const meter = Math.min(100, Math.max(0, Math.round((entries / 6000) * 100)));

  return `<li class="bounty-row" data-slug="${esc(bounty.slug)}"><span class="row-content">
<span class="r-reward"><span class="label">${state.key === 'resolved' ? 'Pot paid' : 'Live pot'}</span><span class="r-amount num">${esc(money(potOf(bounty)))}</span></span>
<span class="r-ident"><span class="r-meta">${chipMarkup(state)}<span class="r-category">${esc(bounty.category || 'Other')}</span><span class="dot-sep" aria-hidden="true">·</span><span>${esc(bounty.sponsor?.name || 'Independent')}</span></span><a class="r-title" href="${esc(bountyHash(bounty.slug))}">${esc(title)}</a>${summary ? `<span class="r-summary">${esc(summary)}</span>` : ''}${won}</span>
<span class="r-fee"><span class="label">Entry</span><span class="r-value">${fee == null ? 'Free' : esc(money(fee))}</span><span class="r-sub">${feeSub}</span></span>
<span class="r-time"><span class="label">${state.key === 'live' ? 'Closes' : 'Deadline'}</span>${deadline}<span class="r-sub">${esc(deadlineShort(bounty.deadline))}</span></span>
<span class="r-entries"><span class="label">Entries</span><span class="r-value num">${esc(num(entries))}</span><span class="r-meter" aria-hidden="true"><i style="width:${meter}%"></i></span><a class="row-standings" href="${esc(leaderboardHash(bounty.slug))}" aria-label="Standings for ${esc(title)}">Standings<span aria-hidden="true"> →</span></a></span>
</span></li>`;
}

function winnerMarkup(bounty) {
  const winner = bounty.winner;
  const image = apiAssetUrl(winner.image);
  return `<div class="winner"><span class="winner-avatar"><span class="winner-mark" aria-hidden="true">${esc((winner.handle || '?').slice(0, 1).toUpperCase())}</span>${image ? `<img class="winner-photo" crossorigin="anonymous" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" src="${esc(image)}">` : ''}</span><span class="winner-main"><a class="winner-handle" href="${esc(profileHash(winner.handle))}">@${esc(winner.handle)}</a><span class="winner-line">won <a class="inline-link" href="${esc(bountyHash(bounty.slug))}">${esc(bounty.title || bounty.slug)}</a></span></span><span class="winner-amount num">${winner.amountUsd ? esc(money(winner.amountUsd)) : '—'}</span></div>`;
}

export async function load() {
  const data = await getBounties();
  if (!Array.isArray(data?.items)) throw new Error('The board answer had no bounties.');
  return data;
}

export const title = () => 'The bounty board · make.fun';

export function create(data, route) {
  let items = Array.isArray(data?.items) ? data.items : [];
  const state = { ...readState(route.params), q: '' };
  const root = el('div', { class: 'board-page' });
  root.innerHTML = `<section class="board-hero">
<p class="kicker">Public bounties · read-only</p><h1>The bounty board.</h1>
<p class="board-deck">Every public call on make.fun: what it pays, what it asks, how long is left, and who has won.</p>
<div class="hero-stats"><div class="stat stat--blue"><span class="stat-glyph" aria-hidden="true">◍</span><span class="stat-number num" data-stat="pot"></span><span class="stat-label">in live pots</span></div><div class="stat stat--sun"><span class="stat-glyph" aria-hidden="true">✦</span><span class="stat-number num" data-stat="live"></span><span class="stat-label">taking entries</span></div><div class="stat stat--warm"><span class="stat-glyph" aria-hidden="true">↗</span><span class="stat-number num" data-stat="entries"></span><span class="stat-label">entries so far</span></div></div>
<p class="hero-meta" data-stat="meta"></p></section>
<section class="board-toolbar" aria-label="Filter and sort the board">
<div class="filters" role="group" aria-label="Bounty filters">${FILTERS.map(([key, label]) => `<button class="filter-btn" type="button" aria-pressed="false" data-view="${key}">${label}<span class="filter-count num"></span></button>`).join('')}</div>
<div class="toolbar-right"><label class="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input type="search" placeholder="Search bounties" aria-label="Search bounties" data-search></label><div class="sort-toggle" role="group" aria-label="Sort bounties"><span class="sort-label">Sort</span><button class="sort-btn" type="button" aria-pressed="false" data-sort="ending">Ending soonest</button><button class="sort-btn" type="button" aria-pressed="false" data-sort="pot">Pot size</button></div><button class="refresh-btn" type="button" title="Revalidate make.fun answers with If-None-Match">Refresh</button></div></section>
<p class="inline-error" role="status" hidden></p>
<div class="board-layout"><section class="board-main" aria-label="Bounties"><p class="board-count"></p><ol class="bounty-list"></ol><div class="board-empty" hidden></div><nav class="pager" aria-label="Board pages"></nav></section>
<aside class="board-aside" aria-label="Today's pick, winners and data notes"><section class="pick-card" hidden><p class="pick-tag">Today’s pick</p><img class="pick-mascot" src="img/mascot-cheer.png" width="190" height="174" loading="lazy" decoding="async" alt="make.fun mascot cheering"><h2 class="pick-title"></h2><p class="pick-line"></p><div class="pick-pot"><span class="pick-pot-value num"></span><img class="pick-coin" src="img/mascot-coin.png" width="44" height="44" loading="lazy" decoding="async" alt=""></div><div class="pick-meter" aria-hidden="true"><i></i></div><a class="pick-link" href="#/">Read the bounty →</a></section>
<section class="aside-block"><h2 class="aside-title">Recent winners</h2><div class="winner-list"></div><p class="aside-note" data-winner-count></p></section>
<section class="aside-block"><h2 class="aside-title">How this board works</h2><p class="aside-note">One read of make.fun’s public API serves the board. Answers stay in memory for a minute, then revalidate with an ETag; a 304 reuses the cached answer.</p><p class="aside-note">Pots are the reward plus entry fees paid. A bounty past its deadline is closed to entries even while its status still says open.</p></section></aside></div>`;

  const list = root.querySelector('.bounty-list');
  const empty = root.querySelector('.board-empty');
  const pager = root.querySelector('.pager');
  const countLine = root.querySelector('.board-count');
  const errorLine = root.querySelector('.inline-error');
  const refresh = root.querySelector('.refresh-btn');
  const winners = root.querySelector('.winner-list');
  const winnerCount = root.querySelector('[data-winner-count]');
  const stat = (key) => root.querySelector(`[data-stat="${key}"]`);
  const filters = [...root.querySelectorAll('.filter-btn')];
  const sorts = [...root.querySelectorAll('.sort-btn')];
  const searchInput = root.querySelector('[data-search]');
  const pickCard = root.querySelector('.pick-card');
  const pickTitle = root.querySelector('.pick-title');
  const pickLine = root.querySelector('.pick-line');
  const pickPot = root.querySelector('.pick-pot-value');
  const pickMeterBar = root.querySelector('.pick-meter i');
  const pickLink = root.querySelector('.pick-link');

  searchInput.addEventListener('input', () => {
    state.q = searchInput.value.trim().toLowerCase();
    state.page = 1;
    paint();
  });

  async function reload() {
    refresh.disabled = true;
    refresh.textContent = 'Refreshing…';
    errorLine.hidden = true;
    window.__shotReady = false;
    try {
      const next = await getBounties({ force: true });
      if (Array.isArray(next?.items)) items = next.items;
      summary();
      paint();
    } catch (error) {
      errorLine.textContent = error?.message || 'Could not refresh the board.';
      errorLine.hidden = false;
    } finally {
      refresh.disabled = false;
      refresh.textContent = 'Refresh';
      window.__shotReady = true;
    }
  }

  root.addEventListener('click', (event) => {
    const view = event.target.closest('[data-view]');
    if (view) {
      if (state.view !== view.dataset.view) { state.view = view.dataset.view; state.page = 1; paint(); }
      return;
    }
    const sort = event.target.closest('[data-sort]');
    if (sort) {
      if (state.sort !== sort.dataset.sort) { state.sort = sort.dataset.sort; state.page = 1; paint(); }
      return;
    }
    if (event.target.closest('.refresh-btn')) { reload(); return; }
    const page = event.target.closest('button[data-page]');
    if (page) {
      if (!page.disabled) { state.page = Number(page.dataset.page); paint(); }
      return;
    }
    const row = event.target.closest('.bounty-row');
    if (row && !event.target.closest('a') && !window.getSelection()?.toString()) location.hash = bountyHash(row.dataset.slug);
  });

  function summary() {
    const now = Date.now();
    const live = items.filter((bounty) => bountyState(bounty, now).key === 'live');
    stat('live').textContent = num(live.length);
    stat('pot').textContent = money(live.reduce((sum, bounty) => sum + potOf(bounty), 0));
    stat('entries').textContent = num(live.reduce((sum, bounty) => sum + (Number(bounty.submissionCount) || 0), 0));
    stat('meta').textContent = `${plural(items.length, 'published bounty', 'published bounties')} · ${plural(live.length, 'taking entries', 'taking entries')} · updated ${new Date().toISOString().slice(11, 16)} UTC`;
    const counts = { live: live.length, closed: 0, resolved: 0, all: items.length };
    for (const bounty of items) {
      const key = bountyState(bounty, now).key;
      if (key === 'closed') counts.closed++;
      if (key === 'resolved') counts.resolved++;
    }
    for (const button of filters) button.querySelector('.filter-count').textContent = num(counts[button.dataset.view] || 0);
    pickBlock();
  }

  function pickBlock() {
    const now = Date.now();
    const live = items.filter((bounty) => bountyState(bounty, now).key === 'live');
    const pick = [...(live.length ? live : items)].sort(
      (a, b) => (Number(b.submissionCount) || 0) - (Number(a.submissionCount) || 0),
    )[0];
    if (!pick) {
      pickCard.hidden = true;
      return;
    }
    const entries = Number(pick.submissionCount) || 0;
    const pot = money(potOf(pick));
    const when =
      bountyState(pick, now).key === 'live'
        ? timeLeftLabel(pick.deadline, now)
        : bountyState(pick, now).key === 'resolved'
          ? 'results published'
          : 'entries closed';
    pickCard.hidden = false;
    pickTitle.textContent = pick.title || pick.slug;
    pickLine.textContent = `${num(entries)} entries · ${pot} pot · ${when}`;
    pickPot.textContent = pot;
    pickMeterBar.style.width = `${Math.min(100, Math.round((entries / 6000) * 100))}%`;
    pickLink.href = bountyHash(pick.slug);
  }

  function winnersBlock() {
    const now = Date.now();
    const recent = items
      .filter((bounty) => bounty.winner?.handle && bountyState(bounty, now).key === 'resolved')
      .sort((a, b) => new Date(b.deadline) - new Date(a.deadline))
      .slice(0, 6);
    winners.innerHTML = recent.length ? recent.map(winnerMarkup).join('') : '<p class="aside-note">No results have been published yet.</p>';
    for (const img of winners.querySelectorAll('img')) img.addEventListener('error', () => img.remove(), { once: true });
    winnerCount.textContent = recent.length ? `${plural(items.filter((bounty) => bounty.winner?.handle).length, 'resolved bounty', 'resolved bounties')} with a named winner.` : '';
  }

  function paint() {
    const now = Date.now();
    const filtered = items.filter((bounty) => {
      if (state.view !== 'all' && bountyState(bounty, now).key !== state.view) return false;
      if (!state.q) return true;
      return [bounty.title, bounty.summary, bounty.category, bounty.sponsor?.name].join(' ').toLowerCase().includes(state.q);
    });
    const sorted = sortRows(filtered, state.sort, now);
    const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
    state.page = Math.min(Math.max(1, state.page), pages);
    const start = (state.page - 1) * PAGE;
    const rows = sorted.slice(start, start + PAGE);

    for (const button of filters) button.setAttribute('aria-pressed', String(state.view === button.dataset.view));
    for (const button of sorts) button.setAttribute('aria-pressed', String(state.sort === button.dataset.sort));

    list.hidden = !rows.length;
    empty.hidden = Boolean(rows.length);
    list.innerHTML = rows.map((bounty) => rowMarkup(bounty, now)).join('');
    if (!rows.length) {
      empty.replaceChildren(
        emptyPanel({
          kicker: 'Nothing here yet',
          title: state.view === 'live' ? 'No bounties are taking entries right now.' : 'No bounties match this view.',
          body:
            state.view === 'live'
              ? 'The next round of bounties will appear here as soon as it opens. You can still browse the full history.'
              : 'Try another filter, or look at every bounty on make.fun.',
          actions: [
            el('a', { class: 'text-link', href: '#/?view=all' }, 'See all bounties →'),
            el('a', { class: 'text-link', href: '#/?view=resolved' }, 'Browse resolved bounties →'),
          ],
        }),
      );
    }

    const viewLabel = state.q ? 'matching' : state.view === 'all' ? 'published' : state.view;
    const first = sorted.length ? start + 1 : 0;
    countLine.textContent = sorted.length
      ? `Showing ${first}–${Math.min(start + PAGE, sorted.length)} of ${num(sorted.length)} ${viewLabel} ${sorted.length === 1 ? 'bounty' : 'bounties'} · ${state.sort === 'pot' ? 'largest pot first' : 'ending soonest first'}`
      : `No ${viewLabel} bounties to show`;

    pager.innerHTML =
      pageButton(Math.max(1, state.page - 1), 'Prev', { label: 'Previous page', disabled: state.page <= 1 }) +
      `<span class="page-list">${pageNumbers(state.page, pages).map((n) => (n === '…' ? '<span class="page-gap" aria-hidden="true">…</span>' : pageButton(n, String(n), { current: n === state.page }))).join('')}</span>` +
      `<span class="page-mobile">Page ${state.page} of ${pages}</span>` +
      pageButton(Math.min(pages, state.page + 1), 'Next', { label: 'Next page', disabled: state.page >= pages });
    pager.hidden = sorted.length <= PAGE;
    replaceHash(boardHash(state));
  }

  summary();
  winnersBlock();
  paint();

  return {
    root,
    update(next, nextRoute) {
      if (Array.isArray(next?.items)) items = next.items;
      if (nextRoute) Object.assign(state, readState(nextRoute.params));
      summary();
      winnersBlock();
      paint();
    },
  };
}
