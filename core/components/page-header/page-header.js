import { loadElements } from '../../js/loader.js';
import { safeHref } from '../../js/safe-url.js';
import { mediaBelow } from '../../js/breakpoints.js';

// True when a slot has an element or non-blank text assigned.
const filled = (el, name) => el.slotted(name).length > 0 || [...el.shadowRoot.querySelector(name ? `slot[name="${name}"]` : 'slot:not([name])').assignedNodes({ flatten: true })].some(n => n.textContent.trim() !== '');

export default Base => class extends Base {
    connected() { for (const s of ['title', 'breadcrumb', '', 'actions', 'meta', 'tabs']) this.watchSlot(s, () => this.requestUpdate()); loadElements(this.shadowRoot); }
    disconnected() { this.$mq?.removeEventListener('change', this.$sync); this.$mq = null; this.$from = null; this.$omq?.removeEventListener('change', this.$sync); this.$omq = null; this.$ofrom = null; }
    /** actionsOverflow: at the named width and below, the slotted actions stay in the light DOM but are hidden, and one trigger opens a menu with one item per action; choosing an item clicks that action. */
    overflow() {
        this.$sync ??= () => this.requestUpdate();
        if (this.$ofrom !== this.actionsOverflow) {
            this.$omq?.removeEventListener('change', this.$sync);
            this.$ofrom = this.actionsOverflow;
            this.$omq = this.$ofrom === 'phone' || this.$ofrom === 'tablet' ? mediaBelow(this.$ofrom) : null;
            this.$omq?.addEventListener('change', this.$sync);
        }
        const actions = this.slotted('actions'), menu = this.part('overflow'), on = actions.length > 0 && (this.$ofrom === 'always' || !!this.$omq?.matches);
        if (!this.$ow) { // the open event refreshes the items first, so a disabled or renamed action is current when the menu shows
            this.$ow = true;
            menu.addEventListener('pk-open', () => this.items());
            menu.addEventListener('pk-select', e => { e.stopPropagation(); e.detail.item.$action?.click(); });
        }
        this.part('actions').toggleAttribute('data-overflow', on);
        this.shadowRoot.querySelector('slot[name="actions"]').hidden = on;
        menu.hidden = !on;
        if (on) this.items();
    }
    items() {
        const menu = this.part('overflow'), doc = this.ownerDocument;
        const rows = this.slotted('actions').map(a => ({ a, label: (a.label || a.getAttribute('aria-label') || a.textContent).trim() })).filter(r => r.label);
        const key = JSON.stringify(rows.map(({ a, label }) => [label, a.getAttribute('icon-name'), a.hasAttribute('disabled'), a.getAttribute('variant')]));
        if (this.$items === key) return;
        this.$items = key;
        const items = rows.map(({ a, label }) => {
            const item = doc.createElement('pk-menu-item');
            item.textContent = label; item.$action = a;
            if (a.hasAttribute('disabled')) item.setAttribute('disabled', '');
            if (a.getAttribute('variant') === 'danger') item.setAttribute('danger', '');
            const icon = a.getAttribute('icon-name');
            if (icon) { const i = doc.createElement('pk-icon'); i.slot = 'prefix'; i.setAttribute('name', icon); item.append(i); }
            return item;
        });
        for (const old of menu.querySelectorAll('pk-menu-item')) old.remove();
        menu.append(...items);
        loadElements(menu);
    }
    // The crumbs prop: a JSON array of { label, href }. A bad value is reported once and draws no trail.
    list() {
        if (!this.crumbs) return [];
        try { const a = JSON.parse(this.crumbs); return Array.isArray(a) ? a.filter(c => c && typeof c.label === 'string') : []; }
        catch (e) { this.warnOnce('crumbs', `crumbs is not a JSON array of { label, href }: ${e.message}`, { crumbs: this.crumbs }); return []; }
    }
    // The breadcrumb and the back link are this element's own shadow tree, drawn from crumbs, homeHref and backLink; rebuilt only when they changed.
    trail(titled) {
        const list = this.list(), home = safeHref(this.homeHref), key = JSON.stringify([list, home, this.homeLabel, this.homeIcon, titled, this.level]);
        const nav = this.part('trail'), back = this.part('back');
        if (this.$key !== key) {
            this.$key = key;
            const doc = this.ownerDocument, kids = [];
            if (home && list.length) {
                const a = doc.createElement('a'), icon = doc.createElement('pk-icon');
                a.href = home; a.setAttribute('aria-label', this.homeLabel); icon.setAttribute('name', this.homeIcon); a.append(icon); kids.push(a);
            }
            list.forEach((c, i) => {
                const href = safeHref(c.href), el = doc.createElement(href ? 'a' : 'span');
                if (href) el.href = href;
                if (i === list.length - 1) { el.setAttribute('aria-current', 'page'); if (!titled) { el.setAttribute('role', 'heading'); el.setAttribute('aria-level', String(this.level)); } } // the last crumb is the page title when no heading is drawn
                el.textContent = c.label; kids.push(el);
            });
            nav.replaceChildren(...kids);
            const parent = list.slice(0, -1).reverse().find(c => safeHref(c.href));
            back.href = parent ? safeHref(parent.href) : ''; back.textContent = parent ? `Back to ${parent.label}` : '';
        }
        nav.hidden = !nav.childElementCount;
        back.hidden = !(this.backLink && back.href);
    }
    /** tabs: [{ value, label, count?, visible? }] draws the docked strip (a slotted pk-tabs wins); tabsFrom limits it to phone or tablet width and below. A chosen tab that went falls back to the first. */
    dock() {
        const own = this.slotted('tabs').some(e => e.getRootNode() !== this.shadowRoot), strip = this.part('strip'), data = own ? null : this.tabs;
        if (this.$data !== data) {
            this.$data = data;
            const keep = strip.value;
            strip.replaceChildren(...(data ?? []).filter(d => d && d.visible !== false).map(d => {
                const t = this.ownerDocument.createElement('pk-tab');
                t.setAttribute('value', d.value); t.textContent = d.label ?? d.value;
                if (d.count != null && d.count !== '') t.setAttribute('count', String(d.count));
                return t;
            }));
            loadElements(strip);
            strip.value = [...strip.children].some(t => t.getAttribute('value') === keep) ? keep : strip.firstElementChild?.getAttribute('value') ?? '';
        }
        if (this.$from !== this.tabsFrom) {
            this.$sync ??= () => this.requestUpdate();
            this.$mq?.removeEventListener('change', this.$sync);
            this.$from = this.tabsFrom;
            this.$mq = this.$from === 'always' ? null : mediaBelow(this.$from);
            this.$mq?.addEventListener('change', this.$sync);
        }
        return (own || !!strip.childElementCount) && (this.$from === 'always' || !!this.$mq?.matches);
    }
    updated() {
        const title = this.part('title');
        if (title) title.hidden = filled(this, 'title'); // a slotted title (a pk-heading) is the heading; the built-in text steps aside
        this.trail(!!this.heading || filled(this, 'title'));
        this.part('crumbs').hidden = !filled(this, 'breadcrumb') && this.part('trail').hidden;
        this.part('actions').hidden = !filled(this, 'actions');
        this.overflow();
        this.part('header').toggleAttribute('data-wide-actions', this.slotted('actions').length > 1 && !this.part('actions').hasAttribute('data-overflow')); // two or more inline actions need their own row on a phone
        this.part('meta').hidden = !filled(this, 'meta');
        this.part('tabs').hidden = !this.dock();
        this.part('chips').hidden = !filled(this, '');
        this.part('titlebar').hidden = !this.heading && !filled(this, '') && !filled(this, 'actions');
    }
};
