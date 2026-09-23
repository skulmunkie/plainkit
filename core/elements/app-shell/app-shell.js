import { safeLink } from '../../js/menu-logic.js';

// pk-app-shell: the frame. A control marked data-nav-toggle in the header toggles the slotted side nav drawer; navOpen mirrors its state.
export default Base => class extends Base {
    connected() {
        if (this.$w) return;
        this.$w = true;
        this.addEventListener('click', e => { if (e.target.closest?.('[data-nav-toggle]')) { const nav = this.nav; if (nav) { nav.open = !nav.open; this.navOpen = nav.open; this.emit('pk-nav-toggle', { open: nav.open }); } } });
        this.addEventListener('pk-close', e => { if (e.target === this.nav && !e.defaultPrevented) this.navOpen = false; });
        this.addEventListener('pk-open', e => { if (e.target === this.nav) this.navOpen = true; });
        this.watchSlot('title', () => this.requestUpdate());
    }
    // Not slotted('nav')[0]: a host framework's own wrapper element (Blazor's generated <span slot="nav"> for a multi-root RenderFragment,
    // issue 212) is the assigned element, not the pk-side-nav inside it, so the unfiltered first assigned element would silently be a span
    // with no `open`. See STANDARDS.md, "Blazor", rule 15.
    get nav() { const a = this.slotted('nav'); return a.find(e => e.localName === 'pk-side-nav') ?? a[0]?.querySelector('pk-side-nav') ?? null; }
    changed(name) { if (name === 'navOpen' && this.nav) this.nav.open = this.navOpen; }
    // The back link goes only to a same-site path or an http(s) address; anything else (a script or data address) is dropped and said once.
    updated() {
        this.part('title').hidden = this.slotted('title').length === 0; // an empty title area would push the header slot to the far side
        const a = this.part('back'), href = this.backHref, go = safeLink(href);
        if (go) a.setAttribute('href', go); else a.removeAttribute('href');
        if (href && !go) { a.hidden = true; this.warnOnce('back-href', `back-href=${JSON.stringify(href)} is not a same-site path or an http(s) address: no back link`, { href }); }
    }
};
