// Formatters only the lazy views need: dates with years, leaderboard columns,
// and the small Markdown renderer. Loaded by the first view that asks for it.

import { esc, money, num, parseDate } from '../core.js';

/** The status pill as markup, for views that build rows as HTML. */
export function chipMarkup(state, label = state?.label ?? 'Unknown') {
  const kind = state?.key || 'unknown';
  return `<span class="chip chip--${esc(kind)}" title="${esc(state?.full || label)}">${kind === 'live' ? '<span class="chip-dot" aria-hidden="true"></span>' : ''}${esc(label)}</span>`;
}

export function statusChip(state, attrs = {}) {
  const t = document.createElement('template');
  t.innerHTML = chipMarkup(state, attrs.label);
  const chip = t.content.firstElementChild;
  if (attrs.class) chip.className += ` ${attrs.class}`;
  return chip;
}

const DAY_MONTH_YEAR = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const TIME_UTC = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });

/** "16 Nov 2026, 21:30 UTC". */
export function dateFull(iso) {
  const d = parseDate(iso);
  return d ? `${DAY_MONTH_YEAR.format(d)}, ${TIME_UTC.format(d)} UTC` : '—';
}

/** "16 Nov 2026". */
export function dateOnly(iso) {
  const d = parseDate(iso);
  return d ? DAY_MONTH_YEAR.format(d) : '—';
}

export function ordinal(n) {
  const value = Number(n);
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  if (value % 10 === 1) return `${value}st`;
  if (value % 10 === 2) return `${value}nd`;
  if (value % 10 === 3) return `${value}rd`;
  return `${value}th`;
}

export function initials(profile) {
  const source = profile?.display_name || profile?.handle || '?';
  const parts = String(source).split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/* ------------------------------------------------------ leaderboard values */

function microMoney(value) {
  return money(Number(value) / 1_000_000);
}

function pctMicro(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${trimPct((n / 1_000_000) * 100)}%` : '—';
}

function pctDecimal(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${trimPct(n * 100)}%` : '—';
}

function trimPct(value) {
  const fixed = Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(2);
  return fixed.replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1');
}

function bytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${n.toLocaleString('en-US')} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

/** A value in a leaderboard column, using the column's key to pick its unit. */
export function formatColumn(key, value, row) {
  if (value == null || value === '') return row?.display != null ? String(row.display) : '—';
  switch (key) {
    case 'judge':
    case 'judge_low':
    case 'judge_high':
      return pctMicro(value);
    case 'net_pnl':
    case 'net_pnl_2x_fees':
      return microMoney(value);
    case 'return':
    case 'max_drawdown':
      return pctDecimal(value);
    case 'cpu_us':
      return `${num(value)} µs`;
    case 'speedup':
      return `${Number(value).toFixed(2)}×`;
    case 'bytes':
      return bytes(value);
    case 'valid':
    case 'passed':
      return Number(value) ? 'Yes' : 'No';
    case 'cases_passed':
      return `${num(value)}${row?.values?.cases_total ? `/${num(row.values.cases_total)}` : ''}`;
    case 'trades':
      return num(value);
    default:
      return row?.display?.[key] != null ? String(row.display[key]) : String(value);
  }
}

/** The value in the row's rank-key column, for full rows and rest stubs. */
export function rankValue(leaderboard, row) {
  const key = leaderboard?.rank_key;
  if (!key) return '—';
  if (row?.values && Object.prototype.hasOwnProperty.call(row.values, key)) return formatColumn(key, row.values[key], row);
  if (row?.value != null) return formatColumn(key, row.value, row);
  return row?.display != null ? String(row.display) : '—';
}

export function intervalValue(leaderboard, row) {
  const key = leaderboard?.rank_key;
  const interval = row?.interval;
  if (!key || !interval || interval.low == null || interval.high == null) return '';
  return `${formatColumn(key, interval.low, row)} – ${formatColumn(key, interval.high, row)}`;
}

export function columnTitle(leaderboard, key) {
  return leaderboard?.columns?.find((column) => column.key === key)?.title || key || 'Score';
}

export function shortColumnTitle(title) {
  const text = String(title || 'Score');
  if (/judge win rate/i.test(text)) return 'Win rate';
  if (/^cpu time/i.test(text)) return 'CPU time';
  if (/^net pnl/i.test(text)) return 'Net PnL';
  if (/interval/i.test(text)) return 'Interval';
  return text.length > 24 ? `${text.slice(0, 23)}…` : text;
}

/** The secondary column worth showing: the tie-break, else a useful extra. */
export function secondaryColumn(leaderboard) {
  const columns = (leaderboard?.columns || []).filter((column) => !column.hidden);
  const rankKey = leaderboard?.rank_key;
  const tieKey = leaderboard?.tie_break?.key;
  if (tieKey) {
    const tie = columns.find((column) => column.key === tieKey);
    if (tie && tie.key !== rankKey) return tie;
  }
  for (const key of ['bytes', 'speedup', 'cases_passed', 'return', 'trades', 'valid']) {
    const column = columns.find((item) => item.key === key && item.key !== rankKey);
    if (column) return column;
  }
  return columns.find((column) => column.key !== rankKey && !/_(low|high)$/.test(column.key)) || null;
}

export function secondaryValue(leaderboard, column, row) {
  if (!column) return '—';
  if (row?.values && Object.prototype.hasOwnProperty.call(row.values, column.key)) return formatColumn(column.key, row.values[column.key], row);
  if (row?.display && typeof row.display === 'object' && row.display[column.key] != null) return String(row.display[column.key]);
  return '—';
}

/* ------------------------------------------------------------ Markdown */

/**
 * A deliberately small Markdown renderer: headings, paragraphs, lists,
 * blockquotes, rules, fenced code, pipe tables, emphasis, code and links.
 * Every value is escaped before markup is added.
 */
export function markdown(source) {
  const text = String(source ?? '').replace(/\r\n?/g, '\n').trim();
  if (!text) return '';
  const lines = text.split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const fence = line.match(/^\s*```([\w-]*)\s*$/);
    if (fence) {
      const body = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++]);
      if (i < lines.length) i++;
      out.push(`<pre><code>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(4, heading[1].length + 1);
      out.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
      i++;
      continue;
    }

    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    if (line.includes('|') && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1] || '')) {
      const header = splitTable(line);
      const align = splitTable(lines[i + 1]).map((cell) => {
        if (/^:-+:$/.test(cell.trim())) return 'center';
        if (/-+:$/.test(cell.trim())) return 'right';
        return 'left';
      });
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(splitTable(lines[i++]));
      out.push(
        `<div class="table-wrap"><table class="md-table"><thead><tr>${header
          .map((cell, index) => `<th style="text-align:${align[index] || 'left'}">${inline(cell.trim())}</th>`)
          .join('')}</tr></thead><tbody>${rows
          .map((row) => `<tr>${row.map((cell, index) => `<td style="text-align:${align[index] || 'left'}">${inline(cell.trim())}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`,
      );
      continue;
    }

    if (/^\s{0,3}>\s?/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s{0,3}>\s?/.test(lines[i])) body.push(lines[i++].replace(/^\s{0,3}>\s?/, ''));
      out.push(`<blockquote>${markdown(body.join('\n'))}</blockquote>`);
      continue;
    }

    if (/^\s{0,3}[-*+]\s+/.test(line) || /^\s{0,3}\d+[.)]\s+/.test(line)) {
      const ordered = /^\s{0,3}\d+[.)]\s+/.test(line);
      const marker = ordered ? /^\s{0,3}\d+[.)]\s+/ : /^\s{0,3}[-*+]\s+/;
      const items = [];
      while (i < lines.length && marker.test(lines[i])) {
        items.push(lines[i++].replace(marker, ''));
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !marker.test(lines[i])) items[items.length - 1] += ` ${lines[i++].trim()}`;
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }

    const para = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i])) para.push(lines[i++].trim());
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }

  return out.join('\n');
}

function startsBlock(line) {
  return (
    /^\s*```/.test(line) ||
    /^\s{0,3}#{1,6}\s+/.test(line) ||
    /^\s{0,3}>\s?/.test(line) ||
    /^\s{0,3}[-*+]\s+/.test(line) ||
    /^\s{0,3}\d+[.)]\s+/.test(line) ||
    /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)
  );
}

function splitTable(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
}

function inline(value) {
  let text = esc(value);
  text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  return text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g, (_, label, href) =>
    `<a href="${href}"${/^https?:/i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`);
}
