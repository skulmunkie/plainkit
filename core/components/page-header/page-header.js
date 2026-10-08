import { loadElements } from '../../js/loader.js';
import { safeHref } from '../../js/safe-url.js';

// True when a slot has an element or non-blank text assigned.
const filled = (el, name) => el.slotted(name).length > 0 || [...el.shadowRoot.querySelector(name ? `slot[name="${name}"]` : 'slot:not([name])').assignedNodes({ flatten: true })].some(n => n.textContent.trim() !== '');

export default Base => class extends Base {
    connected() { for (const s of ['title', 'breadcrumb', '', 'actions', 'meta', 'tabs']) this.watchSlot(s, () => this.requestUpdate()); loadElements(this.shadowRoot); }
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
    updated() {
        const title = this.part('title');
        if (title) title.hidden = filled(this, 'title'); // a slotted title (a pk-heading) is the heading; the built-in text steps aside
        this.trail(!!this.heading || filled(this, 'title'));
        this.part('crumbs').hidden = !filled(this, 'breadcrumb') && this.part('trail').hidden;
        this.part('actions').hidden = !filled(this, 'actions');
        this.part('meta').hidden = !filled(this, 'meta');
        this.part('tabs').hidden = !filled(this, 'tabs');
        this.part('chips').hidden = !filled(this, '');
        this.part('titlebar').hidden = !this.heading && !filled(this, '') && !filled(this, 'actions');
    }
};
