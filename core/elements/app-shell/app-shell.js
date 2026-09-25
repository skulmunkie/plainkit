import { safeLink } from '../../js/menu-logic.js';
import { mediaBelow } from '../../js/breakpoints.js';

// pk-app-shell: the frame. A control marked data-nav-toggle in the header toggles the slotted side nav: the drawer on a phone or tablet (navOpen mirrors
// it), and above the drawer breakpoint it hides and shows the nav (navHidden), which keeps its own expanded or icon-rail state and, when it has a
// persist key, remembers the choice under that key plus ':nav-hidden'.
export default Base => class extends Base {
    connected() {
        if (this.$w) return;
        this.$w = true;
        this.addEventListener('click', e => {
            const nav = e.target.closest?.('[data-nav-toggle]') && this.nav; if (!nav) return;
            if (mediaBelow('tablet').matches) { nav.open = !nav.open; this.navOpen = nav.open; } else this.navHidden = !this.navHidden;
            this.emit('pk-nav-toggle', { open: nav.open, hidden: this.navHidden });
        });
        this.addEventListener('pk-close', e => { if (e.target === this.nav && !e.defaultPrevented) this.navOpen = false; });
        this.addEventListener('pk-open', e => { if (e.target === this.nav) this.navOpen = true; });
        this.watchSlot('title', () => this.requestUpdate());
        this.watchSlot('nav', () => this.restoreNav());
    }
    // Not slotted('nav')[0]: a host framework's own wrapper element (Blazor's generated <span slot="nav"> for a multi-root RenderFragment,
    // issue 212) is the assigned element, not the pk-side-nav inside it, so the unfiltered first assigned element would silently be a span
    // with no `open`. See STANDARDS.md, "Blazor", rule 15.
    get nav() { const a = this.slotted('nav'); return a.find(e => e.localName === 'pk-side-nav') ?? a[0]?.querySelector('pk-side-nav') ?? null; }
    changed(name) {
        if (name === 'navOpen' && this.nav) this.nav.open = this.navOpen;
        else if (name === 'navHidden') this.saveNav();
    }
    get navKey() { const k = this.nav?.getAttribute('persist'); return k ? `${k}:nav-hidden` : ''; }
    saveNav() {
        const k = this.navKey; if (!k) return;
        try { localStorage.setItem(k, this.navHidden ? '1' : '0'); } catch (error) { this.log.debug('storage blocked: the nav visibility is not saved', error); }
    }
    // Once per key: a restore is a change the element makes itself, so it raises the commit event (not cancelable).
    restoreNav() {
        const k = this.navKey; if (!k || this.$rk === k) return;
        this.$rk = k;
        let v = null;
        try { v = localStorage.getItem(k); } catch (error) { this.log.debug('storage blocked: the nav visibility is not restored', error); }
        if (v === null || (v === '1') === this.navHidden) return;
        this.navHidden = v === '1'; this.emit('pk-nav-toggle', { open: this.nav.open, hidden: this.navHidden }, { cancelable: false });
    }
    // The back link goes only to a same-site path or an http(s) address; anything else (a script or data address) is dropped and said once.
    updated() {
        this.restoreNav();
        this.part('title').hidden = this.slotted('title').length === 0; // an empty title area would push the header slot to the far side
        const a = this.part('back'), href = this.backHref, go = safeLink(href);
        if (go) a.setAttribute('href', go); else a.removeAttribute('href');
        if (href && !go) { a.hidden = true; this.warnOnce('back-href', `back-href=${JSON.stringify(href)} is not a same-site path or an http(s) address: no back link`, { href }); }
    }
};
