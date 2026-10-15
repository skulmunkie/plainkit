import { showState, showTitleBar, showTabs } from '../../js/page-shell.js';
import { loadElements } from '../../js/loader.js';
import { filterControl } from '../../js/filter-controls.js';

// Which element a widget's kind composes.
const WIDGET_TAG = { stat: 'pk-stat', chart: 'pk-chart' };
// How far outside the viewport a card may be and still start (#1295): 200px above and below; the sides are wide open, only the vertical position gates a start.
const LAZY_MARGIN = '200px 50000px';

export default Base => class extends Base {
    connected() {
        if (this.$w) { if (this.$started) this.watch(this.$tab); return; }   // moved in the document: the observer was dropped in disconnected()
        this.$w = true;
        loadElements(this.shadowRoot);
        this.part('filters').addEventListener('pk-value-change', e => this.onFilterChange(e));
        this.buildLayout();
    }
    changed(name) {
        if (name !== 'config') return;
        this.buildLayout();
    }

    // Rebuilds the filter bar, the tab strip and every widget card from config, then opens the first tab. Nothing here awaits: each widget's
    // own loadWidget() is its own async boundary, so one slow or rejecting widget never delays or breaks another (#436).
    buildLayout() {
        const doc = this.ownerDocument;
        const body = this.part('body');
        body.replaceChildren();
        this.$cards = {};
        this.$tokens = {};
        this.stopWatching();
        this.$started = new Set();
        showTitleBar(this, this.part('header'));
        this.buildFilters();
        const widgets = this.config?.widgets ?? [];
        if (widgets.length === 0) { showState(body, 'empty', this.config?.empty); return; }
        const tabs = this.config?.tabs?.length ? this.config.tabs : null;
        const first = tabs?.[0]?.id;
        // A widget or section naming no known tab belongs to the first one.
        const tabOf = x => (tabs?.some(t => t.id === x.tab) ? x.tab : first);
        const byKey = Object.fromEntries(widgets.map(w => [w.key, w]));
        const sectionsFor = tab => {
            const own = (this.config?.sections ?? []).filter(s => !tabs || tabOf(s) === tab);
            return own.length ? own : [{ widgets: widgets.filter(w => !tabs || tabOf(w) === tab).map(w => w.key) }];
        };
        const draw = (into, tab) => {
            for (const section of sectionsFor(tab)) {
                const sec = doc.createElement('div');
                sec.setAttribute('part', 'section');
                if (section.heading) {
                    const heading = doc.createElement('h3');
                    heading.setAttribute('part', 'section-heading');
                    heading.textContent = section.heading;
                    sec.append(heading);
                }
                const grid = doc.createElement('div');
                grid.setAttribute('part', 'grid');
                for (const key of section.widgets ?? []) {
                    const widget = byKey[key];
                    if (!widget || this.$cards[key]) continue;
                    const card = doc.createElement('pk-card');
                    card.heading = widget.label ?? '';
                    card.dataset.key = key;
                    card.dataset.tab = tab ?? '';
                    card.dataset.kind = widget.kind ?? 'stat';
                    if (widget.size) card.dataset.size = widget.size;
                    grid.append(card);
                    this.$cards[key] = card;
                }
                sec.append(grid);
                into.append(sec);
            }
        };
        if (!tabs) { draw(body, undefined); loadElements(body); this.activate(undefined); return; }
        showTabs(body, tabs, draw, id => this.activate(id), this.config?.tab);
    }

    disconnected() { this.stopWatching(); }
    stopWatching() { this.$io?.disconnect(); this.$io = null; }

    // Starts the widgets of `tab` that have never started: the first time a tab is shown, never on a revisit, never for a tab never opened. A widget starts when its card is
    // within LAZY_MARGIN of the viewport (the cards keep their reserved min-height, so a late start shifts nothing); leaving a tab drops the starts still waiting in it.
    // Without IntersectionObserver every widget of the tab starts at once.
    activate(tab) {
        if (tab !== undefined) this.onTab?.(tab);
        this.watch(tab);
    }
    watch(tab) {
        this.$tab = tab;
        this.stopWatching();
        const IO = this.ownerDocument.defaultView?.IntersectionObserver;
        const io = IO ? new IO(entries => {
            for (const e of entries) {
                if (!e.isIntersecting) continue;
                io.unobserve(e.target);
                const w = this.config?.widgets?.find(x => x.key === e.target.dataset.key);
                if (w && !this.$started.has(w.key)) this.loadWidget(w);
            }
        }, { rootMargin: LAZY_MARGIN }) : null;
        this.$io = io;
        for (const w of this.config?.widgets ?? []) {
            const card = this.$cards[w.key];
            if (card && (card.dataset.tab || undefined) === tab && !this.$started.has(w.key)) io ? io.observe(card) : this.loadWidget(w);
        }
    }

    buildFilters() {
        const key = JSON.stringify(this.config?.filters ?? []);
        const box = this.part('filters');
        box.hidden = !this.config?.filters?.length;
        if (key === this.$filtersFor) return;
        this.$filtersFor = key;
        // config.values: the selections the bar starts with (a host restores what it saved); they are the context the first loads see.
        const start = this.config?.values ?? {};
        this.context = Object.fromEntries((this.config?.filters ?? []).filter(f => start[f.key] != null && String(start[f.key]) !== '').map(f => [f.key, start[f.key]]));
        // A pk-select has no visible label of its own (its label is the accessible name), so a pk-field shows it; a pk-input shows its own.
        box.replaceChildren(...(this.config?.filters ?? []).map(f => {
            const control = filterControl(this.ownerDocument, f);
            if (this.context[f.key] !== undefined) control.value = this.context[f.key];
            if (control.localName !== 'pk-select') return control;
            const field = this.ownerDocument.createElement('pk-field');
            field.label = f.label ?? f.key;
            field.append(control);
            return field;
        }));
        loadElements(box);
    }
    // Selections live on this.context (an empty one is dropped); every widget that already started reloads, never one in an unopened tab.
    onFilterChange(e) {
        const key = e.target?.dataset?.key;
        if (!key) return;
        const { [key]: _old, ...rest } = this.context ?? {};
        const value = e.detail?.value;
        this.context = value == null || String(value) === '' ? rest : { ...rest, [key]: value };
        for (const w of this.config?.widgets ?? []) if (this.$started.has(w.key)) this.loadWidget(w);
    }

    // The page draws a widget's loading, empty or error state straight into the card's light DOM (its body slot) itself (the card renders no pk-* since #764); data-state
    // on the card says which one (ready once the pk-stat/pk-chart is in).
    drawState(card, state, opts) {
        card.dataset.state = state;
        showState(card, state, opts);
    }

    // One widget's own async boundary, drawn in its pk-card: loading, the pk-stat/pk-chart on success, or an error with Retry on rejection.
    // A token guards against a stale response drawing over a card that has since moved on.
    async loadWidget(widget) {
        const card = this.$cards?.[widget.key];
        if (!card) return;
        this.$started.add(widget.key);
        const token = (this.$tokens[widget.key] = {});
        if (typeof this.load !== 'function') {
            this.drawState(card, 'empty', { heading: widget.empty?.heading, description: widget.empty?.description });
            return;
        }
        this.drawState(card, 'loading', { label: widget.label ? `Loading ${widget.label}` : '' });
        let result;
        try {
            result = await this.load(widget.key);
        } catch (err) {
            if (this.$tokens[widget.key] !== token) return;
            this.drawState(card, 'error', { error: err, retry: () => this.loadWidget(widget) });
            return;
        }
        if (this.$tokens[widget.key] !== token) return;
        if (result === null) { card.hidden = true; card.dataset.state = 'hidden'; return; }   // the host withdrew the widget after loading it (its module's own can)
        const tag = WIDGET_TAG[widget.kind] ?? 'pk-stat';
        const el = this.ownerDocument.createElement(tag);
        if (tag === 'pk-stat') el.label = widget.label ?? '';
        if (tag === 'pk-chart') el.caption = widget.label ?? '';
        Object.assign(el, result);
        card.replaceChildren(el);
        loadElements(card);
        card.dataset.state = 'ready';
    }
};
