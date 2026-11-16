// A bounty's standings. The API's rows=first answer carries the first ten rows
// whole and every later row as a light stub, so the table can page through a
// 10,000-row board without another request or a huge DOM.

import {
  dateFull,
  intervalValue,
  num,
  ordinal,
  rankValue,
  secondaryColumn,
  secondaryValue,
  shortColumnTitle,
  columnTitle,
} from '../format.js';
import { bountyHash, leaderboardHash, profileHash, replaceHash } from '../router.js';
import { el, emptyPanel, replace, setText, statusChip } from '../ui.js';

const PAGE_SIZE = 10;

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

function phaseState(phase) {
  if (!phase?.key && !phase?.title) {
    return { key: 'pending', label: 'Pending', full: 'No standings published yet' };
  }
  if (phase?.scores_visible === false) {
    return { key: 'sealed', label: 'Sealed', full: 'Standings publish when the phase is finalized' };
  }
  if (phase?.finalized_at) return { key: 'resolved', label: 'Final', full: 'Finalized standings' };
  return { key: 'live', label: 'Live', full: 'Standings update as entries are judged' };
}

function recordLine(row) {
  const judge = row?.judge;
  if (!judge || judge.matches == null) return '';
  const wins = Number(judge.wins) || 0;
  const losses = Number(judge.losses) || 0;
  const draws = Number(judge.draws) || 0;
  if (draws) return `${wins}W · ${draws}D · ${losses}L`;
  return `${wins}W · ${losses}L`;
}

export function createLeaderboardView(data, route) {
  const entries = Array.isArray(data?.entries) ? data.entries : [];
  const rest = Array.isArray(data?.rest) ? data.rest : [];
  const total = entries.length + rest.length;
  const phase = data?.phase || {};
  const competition = data?.competition || {};
  const state = phaseState(phase);
  const rankTitle = shortColumnTitle(columnTitle(data, data?.rank_key));
  const secondary = secondaryColumn(data);
  const secondaryTitle = secondary?.title || secondary?.key || '';
  const slug = competition.slug || route.slug;
  const bountyTitle = competition.title || slug;
  const phaseParam = route.params.get('phase') === 'final' ? 'final' : '';
  const pageState = { page: Math.max(1, Number.parseInt(route.params.get('page'), 10) || 1) };

  const phaseSwitch = el('nav', { class: 'phase-switch', 'aria-label': 'Leaderboard phase' });

  const factEntries = el('span', { class: 'fact-value num' });
  const factPage = el('span', { class: 'fact-value' });
  const titleEl = el('span', {});
  const statusSlot = el('span', { class: 'lb-status' });
  const podium = el('div', { class: 'podium' });
  const tableBody = el('tbody');
  const tableWrap = el('div', { class: 'lb-table-wrap', hidden: true });
  const emptyWrap = el('div', { class: 'lb-empty', hidden: true });
  const pager = el('nav', { class: 'pager', 'aria-label': 'Standings pages' });
  const countLine = el('p', { class: 'board-count' });
  const note = el('p', { class: 'lb-note' });

  const root = el(
    'div',
    { class: 'lb-page' },
    el(
      'header',
      { class: 'lb-head' },
      el(
        'nav',
        { class: 'breadcrumb', 'aria-label': 'Breadcrumb' },
        el('a', { href: '#/' }, 'Board'),
        el('span', { class: 'crumb-sep', 'aria-hidden': 'true' }, '/'),
        el('a', { href: bountyHash(slug) }, bountyTitle.length > 54 ? `${bountyTitle.slice(0, 53)}…` : bountyTitle),
        el('span', { class: 'crumb-sep', 'aria-hidden': 'true' }, '/'),
        el('span', { class: 'crumb-current' }, 'Leaderboard'),
      ),
      el(
        'p',
        { class: 'bounty-kicker' },
        statusSlot,
        el('span', {}, `Standings · ${phase.title || 'Results'}`),
        el('span', { class: 'dot-sep', 'aria-hidden': 'true' }, '·'),
        el('span', { class: 'kicker-muted' }, data?.harness_kind || 'judged'),
      ),
      el('h1', { class: 'lb-title' }, 'Leaderboard'),
      el(
        'p',
        { class: 'bounty-deck lb-deck' },
        titleEl,
      ),
      phaseSwitch,
      el(
        'div',
        { class: 'factstrip' },
        el('div', { class: 'fact' }, el('span', { class: 'label' }, 'Ranked entries'), factEntries),
        el(
          'div',
          { class: 'fact' },
          el('span', { class: 'label' }, 'Ranked by'),
          el('span', { class: 'fact-value' }, rankTitle),
        ),
        el(
          'div',
          { class: 'fact' },
          el('span', { class: 'label' }, 'Phase'),
          el('span', { class: 'fact-value' }, phase.title || '—'),
          el('span', { class: 'fact-sub' }, phase.ends_at ? `ends ${dateFull(phase.ends_at)}` : phase.finalized_at ? `finalized ${dateFull(phase.finalized_at)}` : ''),
        ),
        el(
          'div',
          { class: 'fact' },
          el('span', { class: 'label' }, 'Standings'),
          factPage,
        ),
      ),
    ),
    podium,
    note,
    el('section', { class: 'lb-section' }, countLine, tableWrap, emptyWrap, pager),
    el(
      'div',
      { class: 'bounty-foot' },
      el('a', { class: 'text-link', href: bountyHash(slug) }, '← Back to the bounty'),
      el('a', { class: 'text-link', href: '#/' }, 'The board →'),
    ),
  );

  tableWrap.append(
    el(
      'table',
      { class: 'lb-table' },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          el('th', { class: 'lb-th-rank' }, '#'),
          el('th', {}, 'Entrant / entry'),
          el(
            'th',
            { class: 'lb-th-score' },
            rankTitle,
            el('span', { class: 'th-sub' }, '90% interval'),
          ),
        ),
      ),
      tableBody,
    ),
  );

  function pageRows(page) {
    const start = (page - 1) * PAGE_SIZE;
    const output = [];
    for (let index = start; index < start + PAGE_SIZE && index < total; index++) {
      output.push(index < entries.length ? entries[index] : rest[index - entries.length]);
    }
    return output;
  }

  function rowNode(row, index) {
    const rank = row?.rank ?? index + 1;
    const handle = row?.handle || 'unknown';
    const record = recordLine(row);
    const secondaryText = row?.values || row?.display
      ? secondaryValue(data, secondary, row)
      : '—';
    const metaBits = [];
    if (secondary && secondaryText !== '—') metaBits.push(`${secondaryTitle}: ${secondaryText}`);
    if (record) metaBits.push(record);
    if (row?.house) metaBits.push('house entry');
    if (row?.baseline) metaBits.push('baseline');

    return el(
      'tr',
      { class: `lb-row${rank <= 3 ? ' lb-row--top' : ''}` },
      el('td', { class: 'lb-rank num' }, num(rank)),
      el(
        'td',
        { class: 'lb-who' },
        el(
          'span',
          { class: 'lb-who-head' },
          el('a', { class: 'lb-handle', href: profileHash(handle) }, `@${handle}`),
          row?.house ? el('span', { class: 'micro-tag' }, 'house') : null,
          row?.baseline ? el('span', { class: 'micro-tag' }, 'baseline') : null,
        ),
        row?.title ? el('span', { class: 'lb-entry-title' }, row.title) : null,
        metaBits.length ? el('span', { class: 'lb-meta' }, metaBits.join(' · ')) : null,
      ),
      el(
        'td',
        { class: 'lb-score' },
        el('span', { class: 'lb-score-value num' }, rankValue(data, row)),
        intervalValue(data, row)
          ? el('span', { class: 'lb-ci num' }, `90% CI ${intervalValue(data, row)}`)
          : null,
      ),
    );
  }

  function paintPodium() {
    const top = entries.slice(0, 3);
    if (!top.length) {
      replace(podium);
      podium.hidden = true;
      return;
    }
    podium.hidden = false;
    replace(
      podium,
      ...top.map((row, index) =>
        el(
          'article',
          { class: `podium-card${index === 0 ? ' podium-card--first' : ''}` },
          el('div', { class: 'podium-rank num' }, ordinal(row.rank ?? index + 1)),
          el(
            'div',
            { class: 'podium-main' },
            el('a', { class: 'podium-handle', href: profileHash(row.handle || 'unknown') }, `@${row.handle || 'unknown'}`),
            el('span', { class: 'podium-entry' }, row.title || 'Untitled entry'),
          ),
          el('span', { class: 'podium-score num' }, rankValue(data, row)),
        ),
      ),
    );
  }

  function paintPhaseSwitch() {
    const show = Boolean(phaseParam) || (phase.key && phase.key !== 'final');
    phaseSwitch.hidden = !show;
    if (!show) {
      replace(phaseSwitch);
      return;
    }
    const currentLabel = phaseParam ? 'Current' : phase.title || 'Current';
    replace(
      phaseSwitch,
      el(
        'a',
        {
          class: 'phase-option',
          href: leaderboardHash(slug, 1),
          'aria-current': phaseParam ? null : 'page',
        },
        currentLabel,
      ),
      el(
        'a',
        {
          class: 'phase-option',
          href: leaderboardHash(slug, 1, 'final'),
          'aria-current': phaseParam === 'final' ? 'page' : null,
        },
        'Final',
      ),
    );
  }

  function paint() {
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    pageState.page = Math.min(Math.max(1, pageState.page), pages);
    const rows = pageRows(pageState.page);

    setText(factEntries, num(total));
    setText(factPage, total ? (state.key === 'live' ? 'Live' : state.key === 'resolved' ? 'Final' : 'Sealed') : 'None yet');
    setText(titleEl, bountyTitle);
    replace(statusSlot, statusChip(state));
    note.textContent =
      total && phase.placements_held && state.key === 'live'
        ? 'Places are provisional until this phase is finalized and results publish. Intervals are 90%.'
        : '';

    if (!total) {
      tableWrap.hidden = true;
      pager.hidden = true;
      emptyWrap.hidden = false;
      replace(emptyWrap, emptyState());
      setText(countLine, 'No ranked entries in this phase');
      return;
    }

    emptyWrap.hidden = true;
    tableWrap.hidden = false;
    replace(tableBody, ...rows.map((row, index) => rowNode(row, (pageState.page - 1) * PAGE_SIZE + index)));
    const first = (pageState.page - 1) * PAGE_SIZE + 1;
    const last = Math.min(pageState.page * PAGE_SIZE, total);
    setText(countLine, `Showing ${num(first)}–${num(last)} of ${num(total)} ranked ${total === 1 ? 'entry' : 'entries'}`);

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
            if (attrs.disabled || pageState.page === page) return;
            pageState.page = page;
            paint();
            replaceHash(leaderboardHash(slug, pageState.page, phaseParam));
          },
        },
        text,
      );

    replace(
      pager,
      makePage(Math.max(1, pageState.page - 1), 'Prev', { label: 'Previous page', disabled: pageState.page <= 1 }),
      el(
        'span',
        { class: 'page-list' },
        ...pageNumbers(pageState.page, pages).map((value) =>
          value === '…'
            ? el('span', { class: 'page-gap', 'aria-hidden': 'true' }, '…')
            : makePage(value, String(value), { current: value === pageState.page }),
        ),
      ),
      el('span', { class: 'page-mobile' }, `Page ${pageState.page} of ${pages}`),
      makePage(Math.min(pages, pageState.page + 1), 'Next', { label: 'Next page', disabled: pageState.page >= pages }),
    );
    pager.hidden = total <= PAGE_SIZE;
  }

  function emptyState() {
    if (state.key === 'pending') {
      return emptyPanel({
        kicker: 'Nothing published',
        title: 'This bounty has no standings yet.',
        body: 'Standings appear here once entries have been judged and the first results publish. The bounty page still has its dates and prize table.',
        actions: [
          el('a', { class: 'text-link', href: bountyHash(slug) }, 'Back to the bounty →'),
          el('a', { class: 'text-link', href: '#/' }, 'The board →'),
        ],
      });
    }
    if (state.key === 'sealed') {
      const due = phase.ends_at ? `Expected ${dateFull(phase.ends_at)}.` : '';
      return emptyPanel({
        kicker: 'Not published yet',
        title: 'These standings are sealed.',
        body: `The ${phase.title || 'final'} phase publishes its standings once it is finalized. ${due} The bounty page and its prize table are still available.`,
        actions: [
          el('a', { class: 'text-link', href: bountyHash(slug) }, 'Back to the bounty →'),
          el('a', { class: 'text-link', href: '#/' }, 'The board →'),
        ],
      });
    }
    return emptyPanel({
      kicker: 'No standings yet',
      title: 'No entries have been ranked in this phase.',
      body: `Nothing has been judged in ${phase.title || 'this phase'} yet. Standings appear here as entries are scored.`,
      actions: [
        el('a', { class: 'text-link', href: bountyHash(slug) }, 'Back to the bounty →'),
        el('a', { class: 'text-link', href: '#/' }, 'The board →'),
      ],
    });
  }

  paintPhaseSwitch();
  paintPodium();
  paint();

  return {
    root,
    update(next, nextRoute) {
      if (nextRoute) {
        const page = Math.max(1, Number.parseInt(nextRoute.params.get('page'), 10) || 0);
        if (page) pageState.page = page;
      }
      paint();
    },
  };
}
