import { showState, showTitleBar, showTabs } from '../../js/page-shell.js';
import { loadElements } from '../../js/loader.js';
import { filterControl } from '../../js/filter-controls.js';

// Which element a widget's kind composes.
const WIDGET_TAG = { stat: 'pk-stat', chart: 'pk-chart' };

export default Base => class extends Base {
    connected() {
        if (this.$w) return;
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
                    grid.append(card);
                    this.$cards[key] = card;
                }
                sec.append(grid);
                into.append(sec);
            }
        };
        if (!tabs) { draw(body, undefined); loadElements(body); this.activate(undefined); return; }
        showTabs(body, tabs, draw, id => this.activate(id));
    }

    // Starts every widget of `tab` that has never started: the first time a tab is shown, never on a revisit, never for a tab never opened.
    activate(tab) {
        for (const w of this.config?.widgets ?? []) {
            const card = this.$cards[w.key];
            if (card && (card.dataset.tab || undefined) === tab && !this.$started.has(w.key)) this.loadWidget(w);
        }
    }

    buildFilters() {
        const key = JSON.stringify(this.config?.filters ?? []);
        const box = this.part('filters');
        box.hidden = !this.config?.filters?.length;
        if (key === this.$filtersFor) return;
        this.$filtersFor = key;
        this.context = {};
        // A pk-select has no visible label of its own (its label is the accessible name), so a pk-field shows it; a pk-input shows its own.
        box.replaceChildren(...(this.config?.filters ?? []).map(f => {
            const control = filterControl(this.ownerDocument, f);
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

    // One widget's own async boundary, drawn by its pk-card: loading, the pk-stat/pk-chart in the card's slot on success, or an error with
    // Retry on rejection. A token guards against a stale response drawing over a card that has since moved on. retry is set before state
    // (a retry assigned after state="error" does not redraw).
    async loadWidget(widget) {
        const card = this.$cards?.[widget.key];
        if (!card) return;
        this.$started.add(widget.key);
        const token = (this.$tokens[widget.key] = {});
        card.retry = () => this.loadWidget(widget);
        card.stateHeading = ''; card.stateDescription = '';
        if (typeof this.load !== 'function') {
            card.stateHeading = widget.empty?.heading ?? ''; card.stateDescription = widget.empty?.description ?? '';
            card.state = 'empty';
            return;
        }
        card.state = 'loading';
        let result;
        try {
            result = await this.load(widget.key);
        } catch (err) {
            if (this.$tokens[widget.key] !== token) return;
            card.stateDescription = err?.message ?? String(err);
            card.state = 'error';
            return;
        }
        if (this.$tokens[widget.key] !== token) return;
        const tag = WIDGET_TAG[widget.kind] ?? 'pk-stat';
        const el = this.ownerDocument.createElement(tag);
        if (tag === 'pk-stat') el.label = widget.label ?? '';
        if (tag === 'pk-chart') el.caption = widget.label ?? '';
        Object.assign(el, result);
        card.replaceChildren(el);
        loadElements(card);
        card.state = 'ready';
    }
};
