// Small DOM helpers. Views build elements once and patch their text and lists;
// nothing here writes HTML from API text except format.markdown, which escapes.

import { esc, initials, timeLeftLabel, titleCase } from './format.js';

/**
 * el('a', { class: 'x', href: '#/' }, 'Home')
 * Attribute order is kept, which matters for crossorigin before src.
 */
export function el(tag, attrs = null, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
      else node.setAttribute(key, value === true ? '' : String(value));
    }
  }
  append(node, children);
  return node;
}

export function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function replace(node, ...children) {
  node.replaceChildren();
  append(node, children);
  return node;
}

export function setText(node, text) {
  if (node) node.textContent = text == null ? '' : String(text);
}

export function setAttr(node, name, value) {
  if (!node) return;
  if (value == null || value === false) node.removeAttribute(name);
  else node.setAttribute(name, value === true ? '' : String(value));
}

export function clear(node) {
  if (node) node.replaceChildren();
}

/** A URL the API pointed at. Relative API paths are rooted at make.fun. */
export function apiAssetUrl(url) {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('data:')) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('//')) return `https:${url}`;
  return `https://make.fun${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * An <img> whose crossorigin attribute is set before src, as make.fun's
 * CORP: same-origin images require.
 */
export function apiImage(url, attrs = {}) {
  const src = apiAssetUrl(url);
  if (!src) return null;
  const img = el('img', {
    crossorigin: 'anonymous',
    alt: attrs.alt ?? '',
    class: attrs.class,
    width: attrs.width,
    height: attrs.height,
    loading: attrs.loading || 'lazy',
    decoding: 'async',
    referrerpolicy: 'no-referrer',
  });
  if (attrs.onerror) img.addEventListener('error', attrs.onerror, { once: true });
  img.src = src;
  return img;
}

/** A square avatar with a serif monogram underneath if the image cannot load. */
export function avatar(profile, attrs = {}) {
  const wrap = el('span', { class: `avatar${attrs.class ? ` ${attrs.class}` : ''}` });
  const monogram = el('span', { class: 'avatar-mono', 'aria-hidden': 'true' }, initials(profile));
  wrap.append(monogram);

  const candidates = [
    profile?.avatar?.url_small,
    profile?.avatar?.url,
    typeof profile?.image === 'string' ? profile.image : null,
  ].filter(Boolean);

  // Try each candidate in turn: the small avatar may 404 while the full one
  // loads, and either may fail without leaving the profile without its image.
  let index = 0;
  const tryNext = () => {
    while (index < candidates.length) {
      const img = apiImage(candidates[index++], {
        alt: '',
        onerror: () => {
          img.remove();
          tryNext();
        },
      });
      if (img) {
        wrap.append(img);
        return;
      }
    }
  };
  tryNext();
  return wrap;
}

export function statusChip(state, attrs = {}) {
  const label = attrs.label ?? state?.label ?? 'Unknown';
  const kind = state?.key || 'unknown';
  return el(
    'span',
    { class: `chip chip--${kind}${attrs.class ? ` ${attrs.class}` : ''}`, title: state?.full || label },
    kind === 'live' ? el('span', { class: 'chip-dot', 'aria-hidden': 'true' }) : null,
    label,
  );
}

export function countdownNode(iso, attrs = {}) {
  const node = el('span', {
    class: attrs.class,
    'data-countdown': iso || '',
    title: attrs.title,
  });
  node.textContent = iso ? timeLeftLabel(iso) : '—';
  return node;
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

export function link(href, text, attrs = {}) {
  return el('a', { href, class: attrs.class, ...attrs }, text);
}

export function label(text, attrs = {}) {
  return el('span', { class: `label${attrs.class ? ` ${attrs.class}` : ''}` }, text);
}

export function safeText(value) {
  return String(value ?? '');
}

export function externalAttrs(url) {
  return /^https?:/i.test(url || '') ? { target: '_blank', rel: 'noopener noreferrer' } : {};
}

export function humanStatus(value) {
  return titleCase(String(value || '').replace(/_/g, ' '));
}

export { esc };
