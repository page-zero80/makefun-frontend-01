// The board: every public bounty, filtered, sorted, and paginated. One API
// read serves the whole view (pots, fees, deadlines, entries, sponsors and
// recent winners); filtering, sorting and paging patch only the list.

import { getBounties } from '../api.js';
import {
  bountyState,
  deadlineShort,
  deckLine,
  money,
  num,
  plural,
  timeLeftLabel,
} from '../format.js';
import { boardHash, bountyHash, profileHash, replaceHash } from '../router.js';
import {
  apiImage,
  el,
  emptyPanel,
  replace,
  setText,
  statusChip,
} from '../ui.js';

const PAGE_SIZE = 8;
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Live' },
  { key: 'closed', label: 'Closed' },
  { key: 'resolved', label: 'Resolved' },
];

function readState(params) {
  const view = FILTERS.some((filter) => filter.key === params.get('view')) ? params.get('view') : 'all';
  const sort = params.get('sort') === 'pot' ? 'pot' : 'ending';
  const page = Math.max(1, Number.parseInt(params.get('page'), 10) || 1);
  return { view, sort, page };
}

function filterMatches(bounty, view, now) {
  if (view === 'all') return true;
  if (view === 'resolved') return bountyState(bounty, now).key === 'resolved';
  if (view === 'closed') return bountyState(bounty, now).key === 'closed';
  return bountyState(bounty, now).key === 'live';
}

function stateRank(bounty, now) {
  const key = bountyState(bounty, now).key;
  if (key === 'live') return 0;
  if (key === 'closed') return 1;
  return 2;
}

function sortBounties(items, sort, now) {
  const rows = [...items];
  if (sort === 'pot') {
    return rows.sort((a, b) => {
      const pot = (Number(b.potUsd) || 0) - (Number(a.potUsd) || 0);
      if (pot) return pot;
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    });
  }
  return rows.sort((a, b) => {
    const rank = stateRank(a, now) - stateRank(b, now);
    if (rank) return rank;
    const at = new Date(a.deadline).getTime() || 0;
    const bt = new Date(b.deadline).getTime() || 0;
    // Bounties still taking entries end soonest first; closed and resolved
    // boards read newest first.
    return stateRank(a, now) === 0 ? at - bt : bt - at;
  });
}

function potOf(bounty) {
  const value = bounty.potUsd ?? bounty.rewardAmount;
  return Number(value) || 0;
}

function bountyRow(bounty, now) {
  const state = bountyState(bounty, now);
  const fee = bounty.entryFeeUsd == null ? null : Number(bounty.entryFeeUsd);
  const pot = potOf(bounty);
  const entries = Number(bounty.submissionCount) || 0;
  const summary = deckLine(bounty.summary || bounty.description, bounty.title, 138);

  const deadlineValue =
    state.key === 'resolved'
      ? el('span', { class: 'r-value' }, 'Resolved')
      : state.key === 'live'
        ? el('span', { class: 'r-value num', 'data-countdown': bounty.deadline }, timeLeftLabel(bounty.deadline, now))
        : el('span', { class: 'r-value' }, 'Closed');

  const feeSub =
    fee && Number(bounty.entryFeesUsd) > 0
      ? `${money(bounty.entryFeesUsd)} in fees`
      : fee
        ? 'once per account'
        : 'no fee';

  const winner = bounty.winner;
  const winnerLine =
    state.key === 'resolved' && winner?.handle
      ? el(
          'span',
          { class: 'r-winner' },
          'Won by ',
          el('a', { href: profileHash(winner.handle), class: 'inline-link' }, `@${winner.handle}`),
          winner.amountUsd ? ` · ${money(winner.amountUsd)}` : '',
        )
      : null;

  const meta = el(
    'span',
    { class: 'r-meta' },
    statusChip(state),
    el('span', { class: 'r-category' }, bounty.category || 'Other'),
    el('span', { class: 'dot-sep', 'aria-hidden': 'true' }, '·'),
    el('span', {}, bounty.sponsor?.name || 'Independent'),
  );

  const content = el(
    'div',
    { class: 'row-content' },
    el(
      'span',
      { class: 'r-reward' },
      el('span', { class: 'label' }, state.key === 'resolved' ? 'Pot paid' : 'Live pot'),
      el('span', { class: 'r-amount num' }, money(pot)),
    ),
    el(
      'span',
      { class: 'r-ident' },
      meta,
      el('a', { class: 'r-title', href: bountyHash(bounty.slug) }, bounty.title || bounty.slug),
      summary ? el('span', { class: 'r-summary' }, summary) : null,
      winnerLine,
    ),
    el(
      'span',
      { class: 'r-fee' },
      el('span', { class: 'label' }, 'Entry'),
      el('span', { class: 'r-value' }, fee == null ? 'Free' : money(fee)),
      el('span', { class: 'r-sub' }, feeSub),
    ),
    el(
      'span',
      { class: 'r-time' },
      el('span', { class: 'label' }, state.key === 'live' ? 'Closes' : state.key === 'resolved' ? 'Deadline' : 'Deadline'),
      deadlineValue,
      el('span', { class: 'r-sub' }, deadlineShort(bounty.deadline)),
    ),
    el(
      'span',
      { class: 'r-entries' },
      el('span', { class: 'label' }, 'Entries'),
      el('span', { class: 'r-value num' }, num(entries)),
      el(
        'a',
        { class: 'row-standings', href: `${bountyHash(bounty.slug)}/leaderboard`, 'aria-label': `Standings for ${bounty.title || bounty.slug}` },
        'Standings',
        el('span', { 'aria-hidden': 'true' }, ' →'),
      ),
    ),
  );

  const row = el('li', { class: 'bounty-row' }, content);
  row.addEventListener('click', (event) => {
    if (event.target.closest('a')) return;
    if (window.getSelection()?.toString()) return;
    location.hash = bountyHash(bounty.slug);
  });
  return row;
}

function pageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const wanted = [...new Set([1, total, current - 1, current, current + 1])]
    .filter((value) => value >= 1 && value <= total)
    .sort((a, b) => a - b);
  const output = [];
  for (let i = 0; i < wanted.length; i++) {
    if (i && wanted[i] - wanted[i - 1] > 1) output.push('…');
    output.push(wanted[i]);
  }
  return output;
}

export function createBoardView(data, route) {
  let items = Array.isArray(data?.items) ? data.items : [];
  const state = readState(route.params);

  const liveCount = el('span', { class: 'stat-number num' });
  const potCount = el('span', { class: 'stat-number num' });
  const entryCount = el('span', { class: 'stat-number num' });
  const heroMeta = el('p', { class: 'hero-meta' });

  const countLine = el('p', { class: 'board-count' });
  const list = el('ol', { class: 'bounty-list' });
  const emptyWrap = el('div', { class: 'board-empty', hidden: true });
  const pager = el('nav', { class: 'pager', 'aria-label': 'Board pages' });
  const errorLine = el('p', { class: 'inline-error', role: 'status', hidden: true });

  const filterButtons = new Map();
  const tabs = el(
    'div',
    { class: 'filters', role: 'group', 'aria-label': 'Bounty filters' },
    ...FILTERS.map((filter) => {
      const button = el(
        'button',
        { class: 'filter-btn', type: 'button', 'aria-pressed': 'false', dataset: { view: filter.key } },
        filter.label,
        el('span', { class: 'filter-count num' }),
      );
      button.addEventListener('click', () => {
        if (state.view === filter.key) return;
        state.view = filter.key;
        state.page = 1;
        paint();
      });
      filterButtons.set(filter.key, button);
      return button;
    }),
  );

  const sortButtons = new Map();
  const sortWrap = el(
    'div',
    { class: 'sort-toggle', role: 'group', 'aria-label': 'Sort bounties' },
    el('span', { class: 'sort-label' }, 'Sort'),
    ...['ending', 'pot'].map((key) => {
      const button = el(
        'button',
        { class: 'sort-btn', type: 'button', 'aria-pressed': 'false', dataset: { sort: key } },
        key === 'ending' ? 'Ending soonest' : 'Pot size',
      );
      button.addEventListener('click', () => {
        if (state.sort === key) return;
        state.sort = key;
        state.page = 1;
        paint();
      });
      sortButtons.set(key, button);
      return button;
    }),
  );

  const refresh = el('button', { class: 'refresh-btn', type: 'button', title: 'Revalidate make.fun answers with If-None-Match' }, 'Refresh');
  refresh.addEventListener('click', async () => {
    refresh.disabled = true;
    refresh.textContent = 'Refreshing…';
    errorLine.hidden = true;
    window.__shotReady = false;
    try {
      const next = await getBounties({ force: true });
      if (Array.isArray(next?.items)) items = next.items;
      updateSummary();
      paint();
    } catch (error) {
      errorLine.textContent = error?.message || 'Could not refresh the board.';
      errorLine.hidden = false;
    } finally {
      refresh.disabled = false;
      refresh.textContent = 'Refresh';
      window.__shotReady = true;
    }
  });

  const winnersWrap = el('div', { class: 'winner-list' });
  const winnerCount = el('p', { class: 'aside-note' });

  const root = el(
    'div',
    { class: 'board-page' },
    el(
      'section',
      { class: 'board-hero' },
      el('p', { class: 'kicker' }, 'Public bounties · read-only'),
      el('h1', {}, 'The bounty board.'),
      el(
        'p',
        { class: 'board-deck' },
        'Every public call on make.fun: what it pays, what it asks, how long is left, and who has won.',
      ),
      el(
        'div',
        { class: 'hero-stats' },
        el('div', { class: 'stat' }, liveCount, el('span', { class: 'stat-label' }, 'taking entries')),
        el('div', { class: 'stat' }, potCount, el('span', { class: 'stat-label' }, 'in live pots')),
        el('div', { class: 'stat' }, entryCount, el('span', { class: 'stat-label' }, 'entries so far')),
      ),
      heroMeta,
    ),
    el(
      'section',
      { class: 'board-toolbar', 'aria-label': 'Filter and sort the board' },
      tabs,
      el('div', { class: 'toolbar-right' }, sortWrap, refresh),
    ),
    errorLine,
    el(
      'div',
      { class: 'board-layout' },
      el(
        'section',
        { class: 'board-main', 'aria-label': 'Bounties' },
        countLine,
        list,
        emptyWrap,
        pager,
      ),
      el(
        'aside',
        { class: 'board-aside', 'aria-label': 'Winners and data notes' },
        el(
          'section',
          { class: 'aside-block' },
          el('h2', { class: 'aside-title' }, 'Recent winners'),
          winnersWrap,
          winnerCount,
        ),
        el(
          'section',
          { class: 'aside-block' },
          el('h2', { class: 'aside-title' }, 'How this board works'),
          el(
            'p',
            { class: 'aside-note' },
            'One read of make.fun’s public API serves the board. Answers stay in memory for a minute, then revalidate with an ETag; a 304 reuses the cached answer.',
          ),
          el(
            'p',
            { class: 'aside-note' },
            'Pots are the reward plus entry fees paid. A bounty past its deadline is closed to entries even while its status still says open.',
          ),
        ),
      ),
    ),
  );

  function updateSummary() {
    const now = Date.now();
    const live = items.filter((bounty) => bountyState(bounty, now).key === 'live');
    const totalPot = live.reduce((sum, bounty) => sum + potOf(bounty), 0);
    const totalEntries = live.reduce((sum, bounty) => sum + (Number(bounty.submissionCount) || 0), 0);
    setText(liveCount, num(live.length));
    setText(potCount, money(totalPot));
    setText(entryCount, num(totalEntries));
    setText(
      heroMeta,
      `${plural(items.length, 'published bounty', 'published bounties')} · ${plural(live.length, 'taking entries', 'taking entries')} · updated ${new Date().toISOString().slice(11, 16)} UTC`,
    );

    const counts = {
      live: live.length,
      closed: items.filter((bounty) => bountyState(bounty, now).key === 'closed').length,
      resolved: items.filter((bounty) => bountyState(bounty, now).key === 'resolved').length,
      all: items.length,
    };
    for (const [key, button] of filterButtons) {
      const count = button.querySelector('.filter-count');
      setText(count, num(counts[key] ?? 0));
    }
  }

  function updateWinners() {
    const now = Date.now();
    const winners = items
      .filter((bounty) => bounty.winner?.handle && bountyState(bounty, now).key === 'resolved')
      .sort((a, b) => new Date(b.deadline).getTime() - new Date(a.deadline).getTime())
      .slice(0, 6);

    replace(
      winnersWrap,
      ...winners.map((bounty) => {
        const winner = bounty.winner;
        const avatarUrl = winner.image;
        const mark = el('span', { class: 'winner-mark', 'aria-hidden': 'true' }, (winner.handle || '?').slice(0, 1).toUpperCase());
        const img = apiImage(avatarUrl, { alt: '', class: 'winner-photo', onerror: () => img.remove() });
        return el(
          'div',
          { class: 'winner' },
          el('span', { class: 'winner-avatar' }, mark, img),
          el(
            'div',
            { class: 'winner-main' },
            el('a', { class: 'winner-handle', href: profileHash(winner.handle) }, `@${winner.handle}`),
            el(
              'span',
              { class: 'winner-line' },
              'won ',
              el('a', { class: 'inline-link', href: bountyHash(bounty.slug) }, bounty.title || bounty.slug),
            ),
          ),
          el('span', { class: 'winner-amount num' }, winner.amountUsd ? money(winner.amountUsd) : '—'),
        );
      }),
    );
    if (!winners.length) {
      replace(winnersWrap, el('p', { class: 'aside-note' }, 'No results have been published yet.'));
    }
    setText(
      winnerCount,
      winners.length ? `${plural(items.filter((bounty) => bounty.winner?.handle).length, 'resolved bounty', 'resolved bounties')} with a named winner.` : '',
    );
  }

  function paint() {
    const now = Date.now();
    const filtered = items.filter((bounty) => filterMatches(bounty, state.view, now));
    const sorted = sortBounties(filtered, state.sort, now);
    const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    state.page = Math.min(Math.max(1, state.page), pages);
    const start = (state.page - 1) * PAGE_SIZE;
    const rows = sorted.slice(start, start + PAGE_SIZE);

    for (const [key, button] of filterButtons) {
      button.setAttribute('aria-pressed', String(state.view === key));
    }
    for (const [key, button] of sortButtons) {
      button.setAttribute('aria-pressed', String(state.sort === key));
    }

    list.hidden = rows.length === 0;
    emptyWrap.hidden = rows.length !== 0;
    replace(list, ...rows.map((bounty) => bountyRow(bounty, now)));
    if (!rows.length) {
      replace(
        emptyWrap,
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

    const first = sorted.length ? start + 1 : 0;
    const last = Math.min(start + PAGE_SIZE, sorted.length);
    const viewLabel =
      state.view === 'live' ? 'live' : state.view === 'closed' ? 'closed' : state.view === 'resolved' ? 'resolved' : 'published';
    setText(
      countLine,
      sorted.length
        ? `Showing ${first}–${last} of ${num(sorted.length)} ${viewLabel} ${sorted.length === 1 ? 'bounty' : 'bounties'} · ${state.sort === 'pot' ? 'largest pot first' : 'ending soonest first'}`
        : `No ${viewLabel} bounties to show`,
    );

    const makePage = (page, text, attrs = {}) =>
      el(
        'button',
        {
          class: `page-btn${attrs.current ? ' is-current' : ''}`,
          type: 'button',
          'aria-label': attrs.label || `Page ${page}`,
          'aria-current': attrs.current ? 'page' : null,
          disabled: attrs.disabled || null,
          onclick: () => {
            if (attrs.disabled || state.page === page) return;
            state.page = page;
            paint();
          },
        },
        text,
      );

    replace(
      pager,
      makePage(Math.max(1, state.page - 1), 'Prev', {
        label: 'Previous page',
        disabled: state.page <= 1,
      }),
      el(
        'span',
        { class: 'page-list' },
        ...pageNumbers(state.page, pages).map((value) =>
          value === '…'
            ? el('span', { class: 'page-gap', 'aria-hidden': 'true' }, '…')
            : makePage(value, String(value), { current: value === state.page }),
        ),
      ),
      el('span', { class: 'page-mobile' }, `Page ${state.page} of ${pages}`),
      makePage(Math.min(pages, state.page + 1), 'Next', {
        label: 'Next page',
        disabled: state.page >= pages,
      }),
    );
    pager.hidden = sorted.length <= PAGE_SIZE;

    replaceHash(boardHash(state));
  }

  updateSummary();
  updateWinners();
  paint();

  return {
    root,
    update(nextData, nextRoute) {
      if (Array.isArray(nextData?.items)) items = nextData.items;
      if (nextRoute) Object.assign(state, readState(nextRoute.params));
      updateSummary();
      updateWinners();
      paint();
    },
  };
}
