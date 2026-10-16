import { loadElements } from '../../js/loader.js';
import { showTitleBar } from '../../js/page-shell.js';
import { buildField, read, write } from '../../js/page-fields.js';

export default Base => class extends Base {
    connected() {
        // The scroll spy (outside this element's subtree, so added here and removed in disconnected()): a scroll in any container reaches the document in the capture phase.
        this.$scroll ||= () => { if (!this.$q) this.$q = requestAnimationFrame(() => { this.$q = 0; this.spy(); }); };
        this.ownerDocument.addEventListener('scroll', this.$scroll, { capture: true, passive: true });
        if (this.$w) return;
        this.$w = true;
        // The bar, buttons and alerts are real pk-* elements in this shadow tree from the start; load them once here (core/components/detail-layout
        // does the same for its own strip and Next button, and pk-tool-page for its Run button).
        loadElements(this.shadowRoot);
        this.part('form').addEventListener('submit', e => { e.preventDefault(); this.saveNow(); });
        for (const type of ['pk-value-change', 'pk-change', 'pk-range']) this.part('form').addEventListener(type, () => this.paint());
        this.part('discard').addEventListener('click', () => this.discard());
        this.part('nav').addEventListener('click', e => { const item = e.target.closest?.('pk-nav-item'); if (item) { e.preventDefault(); this.go(item.dataset.key); } });
        this.buildTitleBar();
        this.buildSections();
    }
    disconnected() {
        this.ownerDocument.removeEventListener('scroll', this.$scroll, { capture: true });
        if (this.$q) cancelAnimationFrame(this.$q);
        this.$q = 0;
    }
    changed(name) { if (name === 'config') { this.buildTitleBar(); this.buildSections(); } else if (name === 'values') this.applyValues(); }

    // The shared shell's title bar (js/page-shell.js): config.heading, breadcrumb and actions; nothing drawn when none is set.
    buildTitleBar() { showTitleBar(this, this.part('header')); }

    // Rebuilt only when config.sections (or config.nav) itself changes (a JSON prop, so a cheap string compare is the dirty check): every other prop change
    // must never wipe what the reader already typed into a field.
    buildSections() {
        const key = JSON.stringify([this.config?.sections ?? [], this.config?.nav ?? null]);
        if (key === this.$builtFor) return;
        this.$builtFor = key;
        const doc = this.ownerDocument;
        const box = this.part('sections');
        box.replaceChildren();
        this.$controls = {};
        const sections = this.config?.sections ?? [];
        // The section nav (#334): config.nav is true, false or 'auto' (the default: on at three sections or more). Each card is tagged for pk-detail-layout, which draws
        // the tab strip on a phone; the list beside the cards is pk-nav-items, which the CSS hides at that width.
        const nav = this.part('nav'), keys = [], items = [];
        const on = this.config?.nav === true || (this.config?.nav !== false && sections.length >= 3);
        this.$cards = {};
        this.part('empty').hidden = sections.length !== 0;
        for (const [n, section] of sections.entries()) {
            const card = doc.createElement('pk-card');
            if (section.heading) card.heading = section.heading;
            if (on) {
                let id = String(section.key ?? section.heading ?? '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-') || 'section-' + (n + 1);
                while (keys.includes(id)) id += '-' + (n + 1);
                keys.push(id);
                this.$cards[id] = card;
                card.dataset.pkSection = id;
                card.dataset.pkSectionLabel = section.heading || 'Section ' + (n + 1);
                card.setAttribute('role', 'group');
                card.setAttribute('aria-label', card.dataset.pkSectionLabel);
                const item = doc.createElement('pk-nav-item');
                item.dataset.key = id;
                item.setAttribute('href', '#' + id);
                item.textContent = card.dataset.pkSectionLabel;
                items.push(item);
            }
            const stack = doc.createElement('pk-stack');
            for (const f of section.fields ?? []) {
                const { el, row } = buildField(doc, f);
                stack.append(row);
                this.$controls[f.key] = { el, type: f.type };
            }
            card.append(stack);
            box.append(card);
        }
        nav.replaceChildren(...items);
        nav.hidden = !on;
        this.part('body').toggleAttribute('data-nav', on);
        this.mark(keys[0]);
        loadElements(box);
        loadElements(nav);
        this.applyValues();
    }
    // The current nav item carries aria-current (pk-nav-item draws it from `current`); the layout's tab strip follows on a phone.
    mark(key) {
        for (const item of this.part('nav').children) item.toggleAttribute('current', item.dataset.key === key);
        const layout = this.part('layout');
        if (key && layout.section !== key) layout.section = key;
    }
    // A nav item scrolls its card to the top and moves focus onto it: the card is this page's own element, so it takes tabindex -1 and a group name from its heading
    // (the heading itself is inside pk-card's shadow tree, which is not ours to change).
    go(key) {
        const card = this.$cards?.[key];
        if (!card) return;
        this.$lock = Date.now() + 250;
        this.mark(key);
        card.scrollIntoView({ block: 'start' });
        card.setAttribute('tabindex', '-1');
        card.focus({ preventScroll: true });
    }
    // Scroll spy: the last card whose top has reached the sticky nav's line is current. pk-toc does the same for headings, but it looks its target up in the
    // document and these cards are in this shadow tree.
    spy() {
        const nav = this.part('nav');
        if (Date.now() < (this.$lock ?? 0) || nav.hidden || !nav.getClientRects().length) return;
        const keys = Object.keys(this.$cards ?? {}), line = nav.getBoundingClientRect().top + 8;
        const reached = keys.filter(k => this.$cards[k].getBoundingClientRect().top <= line);
        this.mark(reached.length ? reached[reached.length - 1] : keys[0]);
    }
    currentValues() {
        const out = {};
        for (const [key, { el, type }] of Object.entries(this.$controls ?? {})) out[key] = read(el, type);
        return out;
    }
    // Writes the host's values property into the built controls and takes a fresh baseline: called after a rebuild, and again whenever the
    // host sets a new values object (e.g. once ctx.store's own settings finish loading).
    applyValues() {
        for (const [key, { el, type }] of Object.entries(this.$controls ?? {})) if (Object.hasOwn(this.values ?? {}, key)) write(el, type, this.values[key]);
        this.$base = this.currentValues();
        this.paint();
    }
    discard() {
        for (const [key, { el, type }] of Object.entries(this.$controls ?? {})) write(el, type, this.$base?.[key]);
        this.paint();
    }
    paint() {
        this.part('saved').hidden = true;
        const dirty = JSON.stringify(this.currentValues()) !== JSON.stringify(this.$base ?? {});
        this.part('bar').hidden = !dirty;
        if (dirty) { const status = this.part('status'); status.kind = 'warning'; status.textContent = 'Unsaved changes'; }
    }
    // The host's save(values) is a callback property (STANDARDS.md: config is data, callbacks are set from script), never a config key -
    // the same shape as pk-tool-page's run.
    async saveNow() {
        if (typeof this.save !== 'function') return;
        const status = this.part('status');
        const btn = this.part('save');
        btn.disabled = true;
        try {
            await this.save(this.currentValues());
            this.$base = this.currentValues();
            this.part('bar').hidden = true;
            this.part('saved').hidden = false;
        } catch (err) {
            status.kind = 'danger';
            status.textContent = err?.message ?? String(err);
        } finally {
            btn.disabled = false;
        }
    }
};
