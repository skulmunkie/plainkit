// pk-link: a router-aware text link. `href` is a real anchor that navigates natively (external site, or a same-document address); `to` is an
// app-relative route the app router resolves. A plain click on a `to` link is intercepted (same as a native link: not a modified click, no
// target, no download) and reported as a cancelable, composed `pk-navigate` so the app router (mountRouter's own click intercept, js/router.js)
// can handle it and call preventDefault; nothing listening (outside mountApp, or the event left uncancelled) falls back to a normal navigation.
import { safeHref } from '../../js/safe-url.js';

export default Base => class extends Base {
    connected() { if (!this.$w) { this.$w = true; this.part('link').addEventListener('click', e => this.press(e)); } }
    press(e) {
        if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const to = this.to;
        if (!to || this.target || this.download || this.hasAttribute('download')) return;
        e.preventDefault();
        const unhandled = this.emit('pk-navigate', { to, href: safeHref(to) || to });
        if (unhandled) { const win = this.ownerDocument?.defaultView ?? globalThis.window; win?.location?.assign(to); }
    }
    updated() {
        const link = this.part('link');
        const raw = this.to || this.href;
        const href = safeHref(raw);
        if (raw && !href) this.warnOnce('href', `href=${JSON.stringify(raw)} is not a same-site path, http(s), mailto, tel or sms address: the link has no destination`, { href: raw });
        if (href) link.setAttribute('href', href); else link.removeAttribute('href');
        if (this.target) link.setAttribute('target', this.target); else link.removeAttribute('target');
        const rel = this.rel || (this.target === '_blank' ? 'noopener noreferrer' : '');
        if (rel) link.setAttribute('rel', rel); else link.removeAttribute('rel');
        const download = this.download || (this.hasAttribute('download') ? '' : null);
        if (download != null) link.setAttribute('download', download); else link.removeAttribute('download');
        if (this.current) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
        this.part('tab').hidden = this.target !== '_blank';
    }
    focus(options) { this.part('link')?.focus(options); }
};
