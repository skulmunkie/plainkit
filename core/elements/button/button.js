// The attributes of the link form of pk-button. A disabled or busy link drops its href and download (nothing to open, no status-bar URL, no
// middle click) and says aria-disabled; a busy one stays a tab stop, as a busy button does. rel defaults to noopener for a new tab.
import { safeHref } from '../../js/safe-url.js';

export function linkAttrs(p) {
    const off = p.disabled || p.busy;
    return {
        href: off ? null : safeHref(p.href), download: off ? null : p.download, target: p.target || null, rel: p.rel || (p.target === '_blank' ? 'noopener' : null),
        role: 'link', 'aria-disabled': off ? 'true' : null, 'aria-label': p.label || null, 'aria-busy': String(p.busy), tabindex: p.busy && !p.disabled ? '0' : null,
    };
}

import { drawIcon } from '../../js/icon-sprite.js';

// The name an icon button announces, and (as its native tooltip) shows on hover: the label, else the words in the default slot. Empty when the button is not icon-only.
export const tipText = (p, text) => (p.icon ? (p.label || text || '').trim().replace(/\s+/g, ' ') : '');

export default Base => class extends Base {
    connected() { if (!this.$c) { this.$c = e => this.press(e); this.addEventListener('click', this.$c); } }
    press(e) {
        if (this.disabled || this.busy) { e.stopImmediatePropagation(); e.preventDefault(); return; }
        if (this.href) return;
        if (this.toggle) { this.pressed = !this.pressed; this.emit('pk-toggle', { pressed: this.pressed, value: this.value }); }
        if (this.type === 'submit') this.form?.requestSubmit();
        else if (this.type === 'reset') this.form?.reset();
    }
    // The control is a <button>, or with an href an <a>: the shadow tree swaps it, moving the slots and spinner across (the button keeps its bindings).
    control() {
        const c = this.part('control');
        if (Boolean(this.href) === (c.localName === 'a')) return c;
        const n = this.$alt ?? this.shadowRoot.querySelector('template').content.firstChild.cloneNode();
        n.replaceChildren(...c.childNodes); c.replaceWith(n); this.$alt = c;
        return n;
    }
    updated() {
        const c = this.control();
        if (this.href) {
            if (!safeHref(this.href)) this.warnOnce('href', `href=${JSON.stringify(this.href)} is not a same-site path, http(s), mailto, tel or sms address: the link has no destination`, { href: this.href });
            const download = this.download || (this.hasAttribute('download') ? '' : null);
            for (const [k, v] of Object.entries(linkAttrs({ ...this.$, download }))) if (v == null) c.removeAttribute(k); else c.setAttribute(k, v);
        } else if (this.toggle) c.setAttribute('aria-pressed', String(this.pressed)); else c.removeAttribute('aria-pressed');
        // An icon button keeps its name while busy (the spinner replaces the icon, not the words), so busy-text does not swap it.
        this.toggleAttribute('has-busy-text', this.busy && this.busyText !== '' && !this.icon);
        const icon = this.part('icon');
        icon.toggleAttribute('hidden', !this.iconName); // an svg has no hidden property, so the template's data-if cannot do it
        drawIcon(icon.firstChild, this.iconName, (k, m, d) => this.warnOnce(k, m, d));
        // The tooltip: the native title, mirrored from the name, unless a pk-tooltip wraps the button or the author set a title.
        const tip = !this.hasAttribute('title') && !this.closest('pk-tooltip') ? tipText(this, this.textContent) : '';
        if (tip) { c.setAttribute('title', tip); c.setAttribute('aria-description', ''); } else { c.removeAttribute('title'); c.removeAttribute('aria-description'); } // the empty description stops the title being read a second time after the name
    }
};
