// The SDK icon sprite, shared by <pk-icon> and by <pk-button icon-name>: where the sprite is, how one symbol is addressed, and drawing one.
// Framework-free; the only import is the logger.

import { createLogger } from './log.js';

const log = createLogger('icon-sprite');

// The SDK sprite next to this module: dist/js/icon-sprite.js and js/icon-sprite.js -> icons.svg one level up; dist/elements/icon.js -> dist/icons.svg, and
// elements/icon/icon.element.js -> icons.svg at the package root.
// It must be an absolute URL: a relative href inside a shadow root resolves against the page, not the module.
export const spriteUrl = (moduleUrl = import.meta.url) => new URL(/\/elements\/icon\/[^/]*$/.test(moduleUrl) ? '../../icons.svg' : '../icons.svg', moduleUrl).href;

// "search" -> ".../icons.svg#search"; an empty name gives no reference (nothing is drawn).
export const iconHref = (name, sprite = spriteUrl()) => (String(name ?? '').trim() ? `${sprite}#${String(name).trim()}` : '');

// The symbol ids in an SVG sprite's text. Pure.
export const symbolIds = svg => new Set([...String(svg).matchAll(/<symbol\b[^>]*?\sid="([^"]+)"/g)].map(m => m[1]));

// The sprite is read once per page (the browser has it cached from the first <use>); null when it cannot be read (another origin without CORS, offline):
// then a missing name goes unreported rather than guessed at.
let sprite = null;
const spriteSymbols = () => (sprite ??= fetch(spriteUrl()).then(r => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))).then(symbolIds).catch(error => { log.debug('the icon sprite could not be read: missing icon names are not reported', error); return null; }));

// Points a <use> at one symbol (or clears it for an empty name). A name the sprite lacks is reported through warnOnce (an element's own, once per element and name).
export function drawIcon(use, name, warnOnce) {
    const href = iconHref(name);
    if (href && typeof fetch === 'function') {
        const id = String(name).trim();
        spriteSymbols().then(ids => { if (ids && !ids.has(id)) warnOnce(`name:${id}`, `icon "${id}" is not in the sprite: nothing is drawn`, { name: id }); });
    }
    if (href) { if (use.getAttribute('href') !== href) use.setAttribute('href', href); } else use.removeAttribute('href');
}
