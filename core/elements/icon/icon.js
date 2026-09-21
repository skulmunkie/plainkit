// <pk-icon> behaviour and its pure logic: where the sprite is and how one symbol is addressed.

import { createLogger } from '../../js/log.js';

const log = createLogger('pk-icon');

// The SDK sprite next to this module: dist/elements/icon.js -> dist/icons.svg, and elements/icon/icon.element.js -> icons.svg at the package root.
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

export default Base => class extends Base {
    updated() {
        const href = iconHref(this.name);
        if (href && typeof fetch === 'function') {
            const name = String(this.name).trim();
            spriteSymbols().then(ids => { if (ids && !ids.has(name)) this.warnOnce(`name:${name}`, `icon "${name}" is not in the sprite: nothing is drawn`, { name }); });
        }
        const use = this.part('use');
        if (href) { if (use.getAttribute('href') !== href) use.setAttribute('href', href); } else use.removeAttribute('href');
        // A label makes the icon an image with that name; without one it is decoration and hidden from assistive tech.
        if (this.label) this.aria({ role: 'img', ariaLabel: this.label, ariaHidden: null });
        else this.aria({ role: null, ariaLabel: null, ariaHidden: 'true' });
    }
};
