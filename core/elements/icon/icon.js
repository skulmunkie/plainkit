// <pk-icon> behaviour and its pure logic: where the sprite is and how one symbol is addressed.

// The SDK sprite next to this module: dist/elements/icon.js -> dist/icons.svg, and elements/icon/icon.element.js -> icons.svg at the package root.
// It must be an absolute URL: a relative href inside a shadow root resolves against the page, not the module.
export const spriteUrl = (moduleUrl = import.meta.url) => new URL(/\/elements\/icon\/[^/]*$/.test(moduleUrl) ? '../../icons.svg' : '../icons.svg', moduleUrl).href;

// "search" -> ".../icons.svg#search"; an empty name gives no reference (nothing is drawn).
export const iconHref = (name, sprite = spriteUrl()) => (String(name ?? '').trim() ? `${sprite}#${String(name).trim()}` : '');

export default Base => class extends Base {
    updated() {
        const href = iconHref(this.name);
        const use = this.part('use');
        if (href) { if (use.getAttribute('href') !== href) use.setAttribute('href', href); } else use.removeAttribute('href');
        // A label makes the icon an image with that name; without one it is decoration and hidden from assistive tech.
        if (this.label) this.aria({ role: 'img', ariaLabel: this.label, ariaHidden: null });
        else this.aria({ role: null, ariaLabel: null, ariaHidden: 'true' });
    }
};
