// One bounty: the hero, the live pot and fee, the full brief and rules, the
// dates, and all twenty prize places. The detail read leaves out the entry
// list (submissions=summary), so this page stays one small request.

import {
  bountyState,
  dateFull,
  dateOnly,
  deadlineShort,
  deckLine,
  markdown,
  money,
  num,
  ordinal,
  plural,
  timeLeftLabel,
} from '../format.js';
import { leaderboardHash, profileHash } from '../router.js';
import { el, emptyPanel, statusChip } from '../ui.js';

function resultsDueOf(bounty) {
  if (bounty.resolvedAt) return bounty.resolvedAt;
  const phases = Array.isArray(bounty.phases) ? bounty.phases : [];
  const final = phases.find((phase) => phase.key === 'final') || phases[phases.length - 1];
  return final?.endsAt || final?.startsAt || null;
}

function prizeRowsOf(bounty) {
  if (Array.isArray(bounty.rewardsNow) && bounty.rewardsNow.length) {
    return [...bounty.rewardsNow].sort((a, b) => Number(a.place) - Number(b.place));
  }
  return Object.entries(bounty.rewards || {})
    .map(([place, base]) => ({ place: Number(place), baseUsd: String(base), feeShareUsd: '0', amountUsd: String(base) }))
    .sort((a, b) => a.place - b.place);
}

function fact(label, value, sub) {
  return el(
    'div',
    { class: 'fact' },
    el('span', { class: 'label' }, label),
    el('span', { class: 'fact-value num' }, value),
    sub ? el('span', { class: 'fact-sub' }, sub) : null,
  );
}

function definitionRow(term, value) {
  return el('div', { class: 'def-row' }, el('dt', {}, term), el('dd', {}, value));
}

function proseSection(kicker, title, source, className = '') {
  if (!source) return null;
  const prose = el('div', { class: `prose ${className}`.trim() });
  prose.innerHTML = markdown(source);
  return el(
    'section',
    { class: 'bounty-section' },
    el('p', { class: 'kicker' }, kicker),
    title ? el('h2', { class: 'section-title' }, title) : null,
    prose,
  );
}

function rulesSection(bounty) {
  if (!bounty.rules) return null;
  const prose = el('div', { class: 'prose prose--rules' });
  prose.innerHTML = markdown(bounty.rules);
  return el(
    'details',
    { class: 'rules-details' },
    el(
      'summary',
      {},
      el('span', {}, 'Rules and requirements'),
      el('span', { class: 'summary-hint' }, 'Full text'),
    ),
    prose,
  );
}

function judgingSection(bounty) {
  const resolution = bounty.resolution;
  if (!resolution?.summary) return null;
  const criteria = Array.isArray(resolution.criteria) ? resolution.criteria : [];
  return el(
    'details',
    { class: 'rules-details' },
    el('summary', {}, el('span', {}, 'How it is judged'), el('span', { class: 'summary-hint' }, resolution.method || '')),
    el(
      'div',
      { class: 'prose prose--rules' },
      el('p', {}, resolution.summary),
      criteria.length ? el('ul', {}, ...criteria.map((item) => el('li', {}, item))) : null,
    ),
  );
}

export function createBountyView(bounty) {
  const now = Date.now();
  const state = bountyState(bounty, now);
  const pot = Number(bounty.potUsd ?? bounty.rewardAmount) || 0;
  const fees = Number(bounty.entryFeesUsd) || 0;
  const fee = bounty.entryFeeUsd == null ? null : Number(bounty.entryFeeUsd);
  const entries = Number(bounty.submissionCount) || 0;
  const passed = Number(bounty.submissionsPassed);
  const prizes = prizeRowsOf(bounty);
  const due = resultsDueOf(bounty);
  const opens = bounty.opensAt || bounty.publishedAt;
  const title = bounty.title || bounty.slug;
  const sponsor = bounty.sponsor?.name || 'Independent';
  const leaderboardLabel = state.key === 'resolved' ? 'View final standings' : 'View live standings';

  const timeFact =
    state.key === 'resolved'
      ? fact('Resolved', dateOnly(bounty.resolvedAt || bounty.deadline), 'Results published')
      : state.key === 'live'
        ? fact(
            'Time left',
            el('span', { class: 'num', 'data-countdown': bounty.deadline }, timeLeftLabel(bounty.deadline, now)),
            deadlineShort(bounty.deadline),
          )
        : fact('Deadline', 'Closed', deadlineShort(bounty.deadline));

  const feeSub = fee == null ? 'no fee' : plural(bounty.entryFeePayers || 0, 'payer', 'payers');

  const head = el(
    'header',
    { class: 'bounty-head' },
    el(
      'nav',
      { class: 'breadcrumb', 'aria-label': 'Breadcrumb' },
      el('a', { href: '#/' }, 'Board'),
      el('span', { class: 'crumb-sep', 'aria-hidden': 'true' }, '/'),
      el('span', {}, bounty.category || 'Bounty'),
      el('span', { class: 'crumb-sep', 'aria-hidden': 'true' }, '/'),
      el('span', { class: 'crumb-current' }, title.length > 48 ? `${title.slice(0, 47)}…` : title),
    ),
    el(
      'p',
      { class: 'bounty-kicker' },
      statusChip(state),
      el('span', {}, bounty.category || 'Other'),
      el('span', { class: 'dot-sep', 'aria-hidden': 'true' }, '·'),
      el('span', {}, `by ${sponsor}`),
      el('span', { class: 'dot-sep', 'aria-hidden': 'true' }, '·'),
      el('span', { class: 'kicker-muted' }, bounty.harnessKind || 'open call'),
    ),
    el('h1', { class: 'bounty-title' }, title),
    bounty.summary ? el('p', { class: 'bounty-deck' }, deckLine(bounty.summary, title)) : null,
    el(
      'div',
      { class: 'factstrip' },
      fact(
        state.key === 'resolved' ? 'Pot paid' : 'Live pot',
        money(pot),
        fees > 0 ? `${money(fees)} from entry fees` : `reward ${money(bounty.rewardAmount)}`,
      ),
      fact('Entry fee', fee == null ? 'None' : money(fee), feeSub),
      fact('Entries', num(entries), Number.isFinite(passed) && bounty.submissionsPassed != null ? `${num(passed)} passed` : 'in this bounty'),
      timeFact,
    ),
  );

  const prizeTable = el(
    'table',
    { class: 'prize-table' },
    el(
      'thead',
      {},
      el('tr', {}, el('th', {}, 'Place'), el('th', {}, 'Base'), el('th', {}, 'Live')),
    ),
    el(
      'tbody',
      {},
      ...prizes.map((row) =>
        el(
          'tr',
          {},
          el('td', { class: 'prize-place' }, ordinal(row.place)),
          el('td', { class: 'num' }, money(row.baseUsd ?? row.amountUsd)),
          el(
            'td',
            { class: 'num' },
            money(row.amountUsd ?? row.baseUsd),
            Number(row.feeShareUsd) > 0 ? el('span', { class: 'prize-fee' }, `+${money(row.feeShareUsd)}`) : null,
          ),
        ),
      ),
    ),
  );

  const dates = el(
    'dl',
    { class: 'date-list' },
    definitionRow('Opens', dateFull(opens)),
    definitionRow('Entries close', dateFull(bounty.deadline)),
    definitionRow('Results due', due ? dateFull(due) : 'After entries close'),
    definitionRow('Status', state.full),
  );

  const winner = bounty.winner;
  const winnerCard =
    winner?.handle && state.key === 'resolved'
      ? el(
          'section',
          { class: 'winner-card' },
          el('p', { class: 'kicker' }, `Winner${winner.placement && winner.placement !== 1 ? ` · place ${winner.placement}` : ''}`),
          el('a', { class: 'winner-card-handle', href: profileHash(winner.handle) }, `@${winner.handle}`),
          winner.title ? el('p', { class: 'winner-card-entry' }, winner.title) : null,
          el('p', { class: 'winner-card-amount num' }, winner.amountUsd ? money(winner.amountUsd) : ''),
        )
      : null;

  const details = el(
    'dl',
    { class: 'detail-list' },
    definitionRow('Sponsor', sponsor),
    definitionRow('Category', bounty.category || '—'),
    definitionRow('Entry fee', fee == null ? 'None' : money(fee)),
    definitionRow('Entries', num(entries)),
    bounty.skills?.length ? definitionRow('Skills', bounty.skills.join(' · ')) : null,
    bounty.prerequisites?.label
      ? definitionRow(
          'Needs',
          el(
            'span',
            { title: bounty.prerequisites.summary || '' },
            bounty.prerequisites.label,
          ),
        )
      : null,
  );

  const aside = el(
    'aside',
    { class: 'bounty-aside' },
    el(
      'a',
      { class: 'btn btn--primary', href: leaderboardHash(bounty.slug) },
      el('span', {}, leaderboardLabel),
      el('span', { 'aria-hidden': 'true' }, '→'),
    ),
    el(
      'p',
      { class: 'aside-lede' },
      `${num(entries)} ${entries === 1 ? 'entry' : 'entries'} · ${state.key === 'resolved' ? 'final standings' : 'standings update live'}`,
    ),
    el('section', { class: 'aside-block' }, el('h2', { class: 'aside-title' }, 'Key dates'), dates),
    el(
      'section',
      { class: 'aside-block' },
      el('h2', { class: 'aside-title' }, `Prizes · ${prizes.length} ${prizes.length === 1 ? 'place' : 'places'}`),
      prizes.length
        ? prizeTable
        : el('p', { class: 'aside-note' }, 'No prize table has been published for this bounty.'),
      fees > 0
        ? el('p', { class: 'aside-note' }, `Live amounts include ${money(fees)} of entry fees paid so far.`)
        : null,
    ),
    winnerCard,
    el('section', { class: 'aside-block' }, el('h2', { class: 'aside-title' }, 'Details'), details),
  );

  const main = el(
    'div',
    { class: 'bounty-main' },
    bounty.description
      ? proseSection('The brief', null, bounty.description)
      : emptyPanel({
          kicker: 'No brief',
          title: 'This bounty has no public description yet.',
          body: 'Its dates and prize table are still on this page.',
        }),
    rulesSection(bounty),
    judgingSection(bounty),
    el(
      'div',
      { class: 'bounty-foot' },
      el('a', { class: 'text-link', href: '#/' }, '← All bounties'),
      el('a', { class: 'text-link', href: leaderboardHash(bounty.slug) }, `${leaderboardLabel} →`),
    ),
  );

  const root = el('div', { class: 'bounty-page' }, head, el('div', { class: 'bounty-layout' }, main, aside));

  return {
    root,
    update(next) {
      // The router remounts a different bounty; a same-slug refresh is rare.
      if (next?.slug && next.slug !== bounty.slug) return;
    },
  };
}
