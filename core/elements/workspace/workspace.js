// pk-workspace: a nav pane, a main pane and an optional docked aside, each scrolling on its own. Below 640px one pane shows at a time and a
// tab strip switches it. The pure logic (which panes exist, which one shows, how the arrow keys move) is exported so node can test it.
import { mediaBelow } from '../../js/breakpoints.js';

export const PANES = ['nav', 'main', 'aside'];

// Pure: which panel ids are visible, given the list of panel ids and the active one. Unknown ids show nothing.
export function visiblePanels(panelIds, activeId) {
    return panelIds.map(id => ({ id, visible: id === activeId }));
}

// Pure: whether the nav pane shows on a phone, given the active pane.
export const showsNav = pane => pane === 'nav';

// Pure: the panes that exist, in strip order. The main pane always does; the aside only when it is open and has content.
export const availablePanes = ({ nav = false, aside = false, asideOpen = false } = {}) => PANES.filter(p => p === 'main' || (p === 'nav' && nav) || (p === 'aside' && aside && asideOpen));

// Pure: the pane that actually shows: the wanted one when it exists, otherwise the main pane.
export const resolvePane = (pane, available) => (available.includes(pane) ? pane : 'main');

// Pure: the pane an arrow, Home or End key moves to from the current one, or null for any other key.
export function paneKey(key, available, current) {
    const i = available.indexOf(current); const n = available.length;
    if (i < 0 || n === 0) return null;
    if (key === 'ArrowRight' || key === 'ArrowDown') return available[(i + 1) % n];
    if (key === 'ArrowLeft' || key === 'ArrowUp') return available[(i - 1 + n) % n];
    if (key === 'Home') return available[0];
    if (key === 'End') return available[n - 1];
    return null;
}

export default Base => class extends Base {
    connected() { this.setup(); this.$mq?.addEventListener('change', this.$mqf); }
    disconnected() { this.$mq?.removeEventListener('change', this.$mqf); }
    setup() {
        if (this.$w) return;
        this.$w = true;
        const strip = this.part('strip');
        strip.addEventListener('click', e => { const b = e.target.closest?.('[data-pane]'); if (b) this.choose(b.getAttribute('data-pane')); });
        strip.addEventListener('keydown', e => {
            const to = paneKey(e.key, this.$avail ?? [], this.effective);
            if (!to) return;
            e.preventDefault(); this.choose(to, true);
        });
        this.watchSlot('nav', () => this.requestUpdate());
        this.watchSlot('aside', () => this.requestUpdate());
        if (typeof matchMedia === 'function') { this.$mq = mediaBelow('phone'); this.$mqf = () => this.requestUpdate(); }
    }
    get effective() { return resolvePane(this.activePane, this.$avail ?? ['main']); }
    choose(pane, focus = false) {
        const previous = this.effective;
        if (pane !== previous) {
            if (!this.emit('pk-pane-change', { pane, previous })) return;
            this.activePane = pane;
            this.updated();
        }
        if (focus) this.part('strip').querySelector(`[data-pane="${pane}"]`)?.focus();
    }
    updated() {
        const root = this.part('root');
        const hasNav = this.slotted('nav').length > 0; const hasAside = this.slotted('aside').length > 0;
        const avail = this.$avail = availablePanes({ nav: hasNav, aside: hasAside, asideOpen: this.asideOpen });
        const cur = resolvePane(this.activePane, avail);
        root.setAttribute('data-pane', cur);
        root.toggleAttribute('data-nav', hasNav); root.toggleAttribute('data-aside', avail.includes('aside'));
        this.part('strip').hidden = avail.length < 2;
        const labels = { nav: this.navLabel, main: this.mainLabel, aside: this.asideLabel };
        const phone = Boolean(this.$mq?.matches);
        for (const p of PANES) {
            const tab = this.shadowRoot.getElementById(`tab-${p}`); const pane = this.shadowRoot.getElementById(`pane-${p}`);
            tab.hidden = !avail.includes(p);
            tab.setAttribute('aria-selected', String(p === cur)); tab.tabIndex = p === cur ? 0 : -1; tab.setAttribute('aria-controls', `pane-${p}`);
            if (phone) { pane.setAttribute('role', 'tabpanel'); pane.setAttribute('aria-labelledby', `tab-${p}`); pane.removeAttribute('aria-label'); }
            else { pane.setAttribute('role', p === 'aside' ? 'complementary' : 'region'); pane.setAttribute('aria-label', labels[p]); pane.removeAttribute('aria-labelledby'); }
        }
    }
};
