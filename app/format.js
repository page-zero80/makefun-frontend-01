// Formatting helpers for make.fun values. Everything here is pure: no DOM, no fetching.

const NUM = new Intl.NumberFormat('en-US');
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const TIME_UTC = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });

/** Text safe for HTML. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** A dollar amount: 1000 -> $1,000, 0.5 -> $0.50, 9.5 -> $9.50. */
export function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
}

/** A micro-USDC integer as dollars (1_000_000 -> $1.00). */
export function microMoney(value) {
  return money(Number(value) / 1_000_000);
}

/** 10214 -> 10,214. */
export function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? NUM.format(n) : '—';
}

/** A win rate held in millionths: 973639 -> 97.4%. */
export function pctMicro(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${trimPct((n / 1_000_000) * 100)}%`;
}

/** A decimal fraction: 0.177 -> 17.7%. */
export function pctDecimal(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${trimPct(n * 100)}%`;
}

function trimPct(value) {
  const fixed = Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(2);
  return fixed.replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1');
}

/** Bytes as a short human figure; the exact value stays in a title elsewhere. */
export function bytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${NUM.format(n)} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

/** "16 Nov · 21:30 UTC", or a fallback when there is no date. */
export function deadlineShort(iso) {
  const d = parseDate(iso);
  if (!d) return '—';
  return `${DAY_MONTH.format(d)} · ${TIME_UTC.format(d)} UTC`;
}

/** "16 Nov 2026, 21:30 UTC". */
export function dateFull(iso) {
  const d = parseDate(iso);
  if (!d) return '—';
  return `${DAY_MONTH_YEAR.format(d)}, ${TIME_UTC.format(d)} UTC`;
}

/** "16 Nov 2026". */
export function dateOnly(iso) {
  const d = parseDate(iso);
  return d ? DAY_MONTH_YEAR.format(d) : '—';
}

/** "16 Nov". */
export function dateShort(iso) {
  const d = parseDate(iso);
  return d ? DAY_MONTH.format(d) : '—';
}

export function parseDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The remaining time as a compact figure: 2d 4h, 4h 39m, 39m, or Closed. */
export function timeLeft(iso, now = Date.now()) {
  const d = parseDate(iso);
  if (!d) return { text: '—', expired: true, ms: 0 };
  const ms = d.getTime() - now;
  if (ms <= 0) return { text: 'Closed', expired: true, ms };
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return { text: `${days}d ${hours % 24}h`, expired: false, ms };
  if (hours > 0) return { text: `${hours}h ${minutes % 60}m`, expired: false, ms };
  if (minutes > 0) return { text: `${minutes}m`, expired: false, ms };
  return { text: '<1m', expired: false, ms };
}

export function timeLeftLabel(iso, now = Date.now()) {
  const t = timeLeft(iso, now);
  return t.expired ? 'Closed' : `${t.text} left`;
}

/**
 * The effective state of a bounty. A bounty whose deadline has passed is not
 * taking entries, whatever its status still says.
 */
export function bountyState(bounty, now = Date.now()) {
  const status = bounty?.status;
  const deadline = parseDate(bounty?.deadline);
  if (status === 'resolved' || bounty?.resolvedAt) {
    return { key: 'resolved', label: 'Resolved', full: 'Results published' };
  }
  if (status === 'open') {
    if (!deadline || deadline.getTime() > now) {
      return { key: 'live', label: 'Open', full: 'Accepting entries' };
    }
    return { key: 'closed', label: 'Closed', full: 'Entries closed, awaiting results' };
  }
  if (status === 'closed') return { key: 'closed', label: 'Closed', full: 'Entries closed, awaiting results' };
  if (status === 'draft') return { key: 'draft', label: 'Draft', full: 'Not published' };
  return { key: status || 'unknown', label: titleCase(status || 'Unknown'), full: titleCase(status || 'Unknown') };
}

export function isAccepting(bounty, now = Date.now()) {
  return bountyState(bounty, now).key === 'live';
}

export function titleCase(value) {
  return String(value ?? '').replace(/(^|[\s-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
}

export function plural(count, singular, pluralForm = `${singular}s`) {
  return `${num(count)} ${Number(count) === 1 ? singular : pluralForm}`;
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

export function handleLabel(handle) {
  return `@${handle}`;
}

export function initials(profile) {
  const source = profile?.display_name || profile?.handle || '?';
  const parts = String(source).split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function truncate(value, length = 180) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text;
}

/** A one-line summary from a longer description. */
export function summaryLine(value, length = 150) {
  return truncate(String(value ?? '').replace(/[#*_`>]/g, ''), length);
}

/**
 * A deck line that does not repeat the title. make.fun summaries often open
 * with "Title: the rest", which reads badly directly under the same title.
 * Pass length 0 to keep the whole summary.
 */
export function deckLine(value, title, length = 0) {
  let text = String(value ?? '').replace(/[#*_`>]/g, '').replace(/\s+/g, ' ').trim();
  const prefix = String(title ?? '').trim();
  if (prefix && text.toLowerCase().startsWith(`${prefix.toLowerCase()}:`)) {
    text = text.slice(prefix.length + 1).trim();
    if (text) text = text.charAt(0).toUpperCase() + text.slice(1);
  }
  return length > 0 ? truncate(text, length) : text;
}

/* --------------------------------------------------------------------------
   Leaderboard values
   -------------------------------------------------------------------------- */

/** A value in a leaderboard column, using the column's key to pick its unit. */
export function formatColumn(key, value, row) {
  if (value == null || value === '') {
    if (row?.display != null) return String(row.display);
    return '—';
  }
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

/** The value in the row's rank-key column, for both full rows and rest stubs. */
export function rankValue(leaderboard, row) {
  const key = leaderboard?.rank_key;
  if (!key) return '—';
  if (row?.values && Object.prototype.hasOwnProperty.call(row.values, key)) {
    return formatColumn(key, row.values[key], row);
  }
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

/** A short version of a column title for a tight table header. */
export function shortColumnTitle(title) {
  const text = String(title || 'Score');
  if (/judge win rate/i.test(text)) return 'Win rate';
  if (/^cpu time/i.test(text)) return 'CPU time';
  if (/^net pnl/i.test(text)) return 'Net PnL';
  if (/interval/i.test(text)) return 'Interval';
  return truncate(text, 24);
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
  const preference = ['bytes', 'speedup', 'cases_passed', 'return', 'trades', 'valid'];
  for (const key of preference) {
    const column = columns.find((item) => item.key === key && item.key !== rankKey);
    if (column) return column;
  }
  return columns.find((column) => column.key !== rankKey && !/_(low|high)$/.test(column.key)) || null;
}

export function secondaryValue(leaderboard, column, row) {
  if (!column) return '—';
  if (row?.values && Object.prototype.hasOwnProperty.call(row.values, column.key)) {
    return formatColumn(column.key, row.values[column.key], row);
  }
  if (row?.display && typeof row.display === 'object' && row.display[column.key] != null) {
    return String(row.display[column.key]);
  }
  return '—';
}

/* --------------------------------------------------------------------------
   Markdown
   -------------------------------------------------------------------------- */

/**
 * A deliberately small Markdown renderer: headings, paragraphs, lists,
 * blockquotes, rules, fenced code, pipe tables, bold, italics, inline code and
 * links. It escapes every value before adding markup, so API text cannot
 * inject HTML.
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

    // Fenced code.
    const fence = line.match(/^\s*```([\w-]*)\s*$/);
    if (fence) {
      const body = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++]);
      if (i < lines.length) i++;
      out.push(`<pre><code>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }

    // Heading.
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(4, heading[1].length + 1);
      out.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule.
    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    // Table: a header row followed by a separator row.
    if (line.includes('|') && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1] || '')) {
      const header = splitTable(line);
      const align = splitTable(lines[i + 1]).map((cell) => {
        if (/^:-+:$/.test(cell.trim())) return 'center';
        if (/-+:$/.test(cell.trim())) return 'right';
        return 'left';
      });
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(splitTable(lines[i]));
        i++;
      }
      out.push(
        `<div class="table-wrap"><table class="md-table"><thead><tr>${header
          .map((cell, index) => `<th style="text-align:${align[index] || 'left'}">${inline(cell.trim())}</th>`)
          .join('')}</tr></thead><tbody>${rows
          .map(
            (row) =>
              `<tr>${row
                .map((cell, index) => `<td style="text-align:${align[index] || 'left'}">${inline(cell.trim())}</td>`)
                .join('')}</tr>`,
          )
          .join('')}</tbody></table></div>`,
      );
      continue;
    }

    // Blockquote.
    if (/^\s{0,3}>\s?/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s{0,3}>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${markdown(body.join('\n'))}</blockquote>`);
      continue;
    }

    // Unordered list.
    if (/^\s{0,3}[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s{0,3}[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s{0,3}[-*+]\s+/, ''));
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s{0,3}[-*+]\s+/.test(lines[i])) {
          items[items.length - 1] += ` ${lines[i].trim()}`;
          i++;
        }
      }
      out.push(`<ul>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`);
      continue;
    }

    // Ordered list.
    if (/^\s{0,3}\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s{0,3}\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s{0,3}\d+[.)]\s+/, ''));
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s{0,3}\d+[.)]\s+/.test(lines[i])) {
          items[items.length - 1] += ` ${lines[i].trim()}`;
          i++;
        }
      }
      out.push(`<ol>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</ol>`);
      continue;
    }

    // Paragraph: collect lines until a blank line or another block.
    const para = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i])) {
      para.push(lines[i].trim());
      i++;
    }
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
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|');
}

function inline(value) {
  let text = esc(value);
  text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g,
    (_, label, href) =>
      `<a href="${href}"${/^https?:/i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`,
  );
  return text;
}
