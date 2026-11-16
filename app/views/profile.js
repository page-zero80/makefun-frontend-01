// An account's public profile: identity, record, public entries and prizes.
// One profile read; the "show all entries" control patches the list without
// asking the API again.

import {
  bountyState,
  dateOnly,
  formatColumn,
  money,
  num,
  ordinal,
  plural,
} from '../format.js';
import { bountyHash, leaderboardHash } from '../router.js';
import { avatar, el, emptyPanel, replace, statusChip } from '../ui.js';

function recordValue(record, key) {
  const value = record?.[key];
  return value == null ? 0 : Number(value);
}

function stat(label, value, sub) {
  return el(
    'div',
    { class: 'record-stat' },
    el('span', { class: 'stat-number num' }, value),
    el('span', { class: 'stat-label' }, label),
    sub ? el('span', { class: 'record-sub' }, sub) : null,
  );
}

function placeLabel(solution) {
  if (solution.placement == null) {
    const key = bountyState(solution.competition || {}, Date.now()).key;
    if (key === 'resolved') return 'Not placed';
    return key === 'live' ? 'In progress' : 'Awaiting results';
  }
  if (Number(solution.placement) === 1) return 'Winner';
  return `Placed ${ordinal(solution.placement)}`;
}

function scoreLabel(solution) {
  const score = solution.score;
  if (!score?.column?.key) return '';
  const title = score.column.title || score.column.key;
  return `${title}: ${formatColumn(score.column.key, score.value, { display: score.display })}`;
}

function solutionRow(solution) {
  const competition = solution.competition || {};
  const state = bountyState(competition, Date.now());
  const prize = Number(solution.prize_usd);
  return el(
    'article',
    { class: 'solution' },
    el(
      'div',
      { class: 'solution-main' },
      el(
        'div',
        { class: 'solution-top' },
        el('a', { class: 'solution-bounty', href: bountyHash(competition.slug) }, competition.title || competition.slug || 'Untitled bounty'),
        statusChip(state),
      ),
      solution.title ? el('h3', { class: 'solution-entry' }, solution.title) : null,
      el(
        'p',
        { class: 'solution-meta' },
        competition.category ? `${competition.category} · ` : '',
        placeLabel(solution),
        prize > 0 ? ` · ${money(prize)}` : '',
        scoreLabel(solution) ? ` · ${scoreLabel(solution)}` : '',
        solution.entered_at ? ` · entered ${dateOnly(solution.entered_at)}` : '',
      ),
    ),
    el(
      'div',
      { class: 'solution-side' },
      el(
        'a',
        { class: 'solution-standings', href: leaderboardHash(competition.slug) },
        'Standings',
        el('span', { 'aria-hidden': 'true' }, ' →'),
      ),
    ),
  );
}

function payoutRow(payout) {
  const competition = payout.competition || {};
  return el(
    'div',
    { class: 'payout' },
    el('span', { class: 'payout-amount num' }, money(payout.amount_usd ?? 0)),
    el(
      'div',
      { class: 'payout-main' },
      el('a', { class: 'payout-competition', href: bountyHash(competition.slug) }, competition.title || competition.slug || 'A bounty'),
      el(
        'span',
        { class: 'payout-meta' },
        payout.place ? `Place ${ordinal(payout.place)} · ` : '',
        payout.paid_at ? `paid ${dateOnly(payout.paid_at)}` : 'paid',
      ),
    ),
  );
}

function linkRows(profile) {
  const rows = [];
  if (profile.github_login) rows.push(['GitHub', profile.github_login]);
  if (profile.discord?.username) rows.push(['Discord', profile.discord.username]);
  if (profile.x?.username) rows.push(['X', `@${profile.x.username}`]);
  if (profile.wallet?.address) {
    const address = profile.wallet.address;
    rows.push(['Wallet', `${address.slice(0, 6)}…${address.slice(-6)}`]);
  }
  if (!rows.length) return null;
  return el(
    'dl',
    { class: 'link-list' },
    ...rows.flatMap(([term, value]) => [el('dt', {}, term), el('dd', { title: value }, value)]),
  );
}

export function createProfileView(profile, route) {
  const handle = profile.handle || route.handle;
  const displayName = String(profile.display_name || '').trim();
  const handleOnly = !displayName || displayName.replace(/^@/, '') === handle;
  const nameText = handleOnly ? `@${handle}` : displayName;
  const showHandleLine = !handleOnly;
  const record = profile.record || {};
  const solutions = Array.isArray(profile.solutions) ? profile.solutions : [];
  const payouts = Array.isArray(profile.payouts) ? profile.payouts : [];
  const entered = recordValue(record, 'competitions_entered');
  const placed = recordValue(record, 'competitions_placed');
  const won = recordValue(record, 'competitions_won');
  const prize = record.prize_usd ?? '0.00';
  const limit = 8;

  const solutionList = el('div', { class: 'solution-list' });
  const showAll = el('button', { class: 'text-btn', type: 'button' }, `Show all ${num(solutions.length)} entries`);
  const emptySolutions = el('div', { class: 'profile-empty', hidden: true });

  const asideLinks = linkRows(profile);
  const root = el(
    'div',
    { class: 'profile-page' },
    el(
      'header',
      { class: 'profile-head' },
      el(
        'nav',
        { class: 'breadcrumb', 'aria-label': 'Breadcrumb' },
        el('a', { href: '#/' }, 'Board'),
        el('span', { class: 'crumb-sep', 'aria-hidden': 'true' }, '/'),
        el('span', {}, 'Profile'),
        el('span', { class: 'crumb-sep', 'aria-hidden': 'true' }, '/'),
        el('span', { class: 'crumb-current' }, `@${handle}`),
      ),
      el(
        'div',
        { class: 'profile-identity' },
        avatar(profile, { class: 'profile-avatar' }),
        el(
          'div',
          { class: 'profile-copy' },
          el(
            'p',
            { class: 'bounty-kicker' },
            profile.house ? el('span', { class: 'chip chip--house' }, 'House account') : el('span', { class: 'chip chip--live' }, 'Public profile'),
            profile.demo ? el('span', { class: 'chip chip--draft' }, 'Demo') : null,
            el('span', { class: 'kicker-muted' }, `joined ${dateOnly(profile.joined_at)}`),
          ),
          el('h1', { class: 'profile-name' }, nameText),
          showHandleLine ? el('p', { class: 'profile-handle' }, `@${handle}`) : null,
          profile.bio ? el('p', { class: 'profile-bio' }, profile.bio) : null,
        ),
      ),
      el(
        'div',
        { class: 'record-strip' },
        stat('Competitions entered', num(entered), 'public entries'),
        stat('Placed', num(placed), placed ? `${Math.round((placed / Math.max(1, entered)) * 100)}% of entries` : 'no places yet'),
        stat('Won', num(won), won ? 'first places' : 'still looking'),
        stat('Prize money', money(prize), payouts.length ? `${plural(payouts.length, 'payout')} paid` : 'no payouts yet'),
      ),
    ),
    el(
      'div',
      { class: 'profile-layout' },
      el(
        'section',
        { class: 'profile-main' },
        el(
          'div',
          { class: 'section-heading' },
          el('p', { class: 'kicker' }, 'Public entries'),
          el('h2', { class: 'section-title' }, `Entries${solutions.length ? ` · ${num(solutions.length)}` : ''}`),
        ),
        solutionList,
        emptySolutions,
        solutions.length > limit ? showAll : null,
      ),
      el(
        'aside',
        { class: 'profile-aside' },
        el(
          'section',
          { class: 'aside-block' },
          el('h2', { class: 'aside-title' }, 'Record'),
          el(
            'dl',
            { class: 'detail-list' },
            el('div', { class: 'def-row' }, el('dt', {}, 'Best placement'), el('dd', {}, record.best_placement ? ordinal(record.best_placement) : '—')),
            el('div', { class: 'def-row' }, el('dt', {}, 'Podium finishes'), el('dd', { class: 'num' }, num(record.podium_finishes || 0))),
            el('div', { class: 'def-row' }, el('dt', {}, 'Other placements'), el('dd', { class: 'num' }, num(record.other_placements || 0))),
            el('div', { class: 'def-row' }, el('dt', {}, 'Prizes paid'), el('dd', { class: 'num' }, money(prize))),
            el('div', { class: 'def-row' }, el('dt', {}, 'Joined'), el('dd', {}, dateOnly(profile.joined_at))),
          ),
        ),
        el(
          'section',
          { class: 'aside-block' },
          el('h2', { class: 'aside-title' }, `Payouts${payouts.length ? ` · ${num(payouts.length)}` : ''}`),
          payouts.length
            ? el('div', { class: 'payout-list' }, ...payouts.map(payoutRow))
            : el('p', { class: 'aside-note' }, 'No prizes have been paid to this account yet.'),
        ),
        asideLinks
          ? el('section', { class: 'aside-block' }, el('h2', { class: 'aside-title' }, 'Links'), asideLinks)
          : null,
        el(
          'section',
          { class: 'aside-block' },
          el('h2', { class: 'aside-title' }, 'Find them on the board'),
          el('p', { class: 'aside-note' }, 'Every public entry links back to its bounty and live standings.'),
          el('a', { class: 'text-link', href: '#/?view=resolved' }, 'Recent winners →'),
        ),
      ),
    ),
    el(
      'div',
      { class: 'bounty-foot' },
      el('a', { class: 'text-link', href: '#/' }, '← The board'),
      el('a', { class: 'text-link', href: '#/?view=resolved' }, 'Winners →'),
    ),
  );

  function paintSolutions(showAllEntries = false) {
    const visible = showAllEntries ? solutions : solutions.slice(0, limit);
    replace(solutionList, ...visible.map(solutionRow));
    if (!solutions.length) {
      emptySolutions.hidden = false;
      replace(
        emptySolutions,
        emptyPanel({
          kicker: 'Nothing public yet',
          title: 'No public entries on this account.',
          body: 'Entries appear here once they are made in a published competition.',
          actions: [el('a', { class: 'text-link', href: '#/' }, 'Browse the board →')],
        }),
      );
    } else {
      emptySolutions.hidden = true;
    }
    showAll.hidden = solutions.length <= limit || showAllEntries;
  }

  showAll.addEventListener('click', () => paintSolutions(true));
  paintSolutions();

  return {
    root,
    update(next) {
      if (next?.handle && next.handle !== handle) return;
    },
  };
}
