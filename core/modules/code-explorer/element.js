// <pk-code-explorer> custom element: a file tree, a tab strip of open files, a line-numbered code viewer and a docked
// outline / usages inspector, fed by one provider (see providers.js). Light DOM: the panes, tabs, tree, inputs, buttons and badges
// are pk-* elements (loaded on demand); code-explorer.css, loaded here, styles the viewer, outline and search results.
//
//   <pk-code-explorer source="snapshot" src="snapshot.json"></pk-code-explorer>
//   <pk-code-explorer source="api" src="./api/code" theme="light" height="40rem"></pk-code-explorer>
//   <pk-code-explorer source="feed" src="./api/code/events" base="./api/code" feed-interval="5000"></pk-code-explorer>
//
// Attributes (all optional except source/src unless a provider is assigned): source, src, base (feed only), theme
// (light|dark, sets data-theme), height (any CSS length, or "fill"; default 32rem), initial (a path to open first; initial-line focuses a row),
// search (a query to run once the files are listed), max-lines (rows drawn per file, default 2000), feed-interval (ms; polls instead of SSE). Property `provider` accepts
// a ready provider object; property `patterns` accepts a host-defined [{ name, pattern, label? }] (reports.js), adding a "Patterns" choice
// to the Reports button's picker alongside the always-available largest files, longest methods and duplicate blocks reports.
// Events: "pk-code-explorer-open" (detail { path }), "pk-code-explorer-error" (detail { error }).
// Phone: below 640px pk-workspace shows one pane at a time (Files, Code, Inspector) with its own tab strip.

import { createProvider, wordSpans, matcherFor } from './providers.js';
import { buildSegments, tokenize, wordAt, languageOf } from './tokenize.js';
import { patternReport, largestFilesReport, longestMethodsReport, duplicateBlocksReport } from './reports.js';
import { ensureStyles, styleUrls, on } from '../../js/mount-support.js';
import { loadElements } from '../../js/loader.js';
import { applyDynamic } from '../../js/dynamic.js';
import { createLogger } from '../../js/log.js';
const log = createLogger('code-explorer');

const CSS = ['./code-explorer.css'];
const NAV = '::nav';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// The one place markup is written into the document: every value in it went through esc(), tokens are wrapped in fixed spans.
const fill = (el, markup) => { el.innerHTML = markup; };

// Folder tree from flat paths: { name, path, children: Map, file? }.
export function buildTree(files, filter = '') {
    const root = { name: '', path: '', children: new Map(), lines: 0, count: 0 };
    const needle = filter.trim().toLowerCase();
    for (const f of files) {
        if (needle && !f.path.toLowerCase().includes(needle)) continue;
        let node = root;
        const parts = f.path.split('/');
        parts.forEach((part, i) => {
            if (!node.children.has(part)) node.children.set(part, { name: part, path: parts.slice(0, i + 1).join('/'), children: new Map(), lines: 0, count: 0 });
            node = node.children.get(part);
            node.lines += f.lines ?? 0; node.count++;
            if (i === parts.length - 1) node.file = f;
        });
    }
    return root;
}

const Base = globalThis.HTMLElement ?? class {};

export class CodeExplorerElement extends Base {
    static get observedAttributes() { return ['theme', 'height']; }

    #provider = null;
    #files = [];
    #open = [];
    #active = NAV;
    #docs = new Map();
    #focus = null;
    #word = '';
    #filter = '';
    #search = null;
    #patterns = [];
    #reports = null;
    #inspector = null;
    #folders = new Set();
    #nodes = new Map();
    #ready = Promise.resolve();
    #unsubscribe = null;

    set provider(p) { this.#provider = p; if (this.isConnected) this.#start(); }
    get provider() { return this.#provider; }

    // Host-defined patterns for the pattern report (reports.js). The Reports button always shows the built-in reports
    // (largest files, longest methods, duplicate blocks); patterns just add one more report choice to the picker.
    set patterns(p) { this.#patterns = p ?? []; }
    get patterns() { return this.#patterns; }

    connectedCallback() {
        this.#applyAttributes();
        ensureStyles(styleUrls(CSS, import.meta.url), this.ownerDocument);
        this.#build();
        this.#start();
    }

    disconnectedCallback() { this.#unsubscribe?.(); this.#unsubscribe = null; }

    attributeChangedCallback() { if (this.isConnected) this.#applyAttributes(); }

    #applyAttributes() {
        const theme = this.getAttribute('theme');
        if (theme) this.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
        const h = this.getAttribute('height');
        if (h) { this.dataset.dyn = `--pk-code-explorer-height:${h === 'fill' ? '100%' : h}`; applyDynamic(this); }
    }

    // Load the modules of any pk-* element that was just written and is not defined yet (a no-op once they all are).
    #upgrade() { loadElements(this); }

    #build() {
        fill(this, `
<pk-workspace fill active-pane="nav" nav-label="Files" main-label="Code" aside-label="Inspector" data-ce-root>
  <pk-container slot="nav" size="full" padding="sm"><pk-stack gap="sm">
    <pk-input type="search" label="Filter files" placeholder="Filter files by path" data-ce-filter></pk-input>
    <pk-input type="search" label="Search code" placeholder="Search code: text or /regex/" data-ce-query data-ce-searchbox></pk-input>
    <pk-cluster gap="sm">
      <pk-button size="mini" data-ce-search hidden>Search</pk-button>
      <pk-button size="mini" variant="ghost" data-ce-reports>Reports</pk-button>
      <pk-button size="mini" variant="ghost" data-ce-clear hidden>Back to files</pk-button>
    </pk-cluster>
    <div data-ce-tree></div>
  </pk-stack></pk-container>
  <div class="ce-main">
    <pk-tabs overflow="scroll" none-active data-ce-tabs></pk-tabs>
    <div class="ce-pane" data-ce-pane></div>
  </div>
  <pk-container slot="aside" size="full" padding="sm" data-ce-inspector><pk-stack gap="sm">
    <pk-cluster justify="between" nowrap><pk-heading level="2" variant="h6" data-ce-inspector-title>Outline</pk-heading><pk-button size="mini" variant="ghost" icon label="Close inspector" data-ce-inspector-close icon-name="x"></pk-button></pk-cluster>
    <div data-ce-inspector-body></div>
  </pk-stack></pk-container>
</pk-workspace>`);
        const $ = s => this.querySelector(s);
        on($('[data-ce-filter]'), 'input', e => { this.#filter = e.target.value; this.#renderTree(); });
        const runSearch = () => this.#runSearch($('[data-ce-query]').value);
        on($('[data-ce-query]'), 'keydown', e => { if (e.key === 'Enter') runSearch(); });
        on($('[data-ce-search]'), 'click', runSearch);
        on($('[data-ce-reports]'), 'click', () => this.#toggleReports());
        on($('[data-ce-clear]'), 'click', () => { this.#search = null; this.#reports = null; this.#renderTree(); });
        on($('[data-ce-inspector-close]'), 'click', () => { this.#inspector = null; this.#renderInspector(); this.#showPane('main'); });
        const tree = $('[data-ce-tree]');
        on(tree, 'click', e => this.#onHitClick(e));
        on(tree, 'pk-select', e => this.#onTreeSelect(e));
        on(tree, 'pk-toggle', e => this.#onTreeToggle(e));
        const tabs = $('[data-ce-tabs]');
        on(tabs, 'pk-tab-change', e => { if (e.detail.fallback) return; this.#active = e.detail.value; this.#focus = null; this.#renderPane(); this.#syncTree(); });
        on(tabs, 'pk-tab-close', e => this.#closeTab(e.detail.value));
        on(tabs, 'keydown', e => { const tab = e.target.closest?.('pk-tab'); if (tab && e.key === 'Delete') this.#closeTab(tab.value, true); });
        on($('[data-ce-pane]'), 'click', e => this.#onPaneClick(e));
        on($('[data-ce-inspector-body]'), 'click', e => this.#onInspectorClick(e));
        on(this, 'keydown', e => { if (e.key === 'Escape' && this.#inspector) { this.#inspector = null; this.#renderInspector(); this.#showPane('main'); } });
        // Load every element the explorer writes before the first tree is drawn: a pk-tree that defines before its items would
        // update against items that are not upgraded yet.
        const scratch = this.ownerDocument.createElement('div');
        fill(scratch, '<pk-tree><pk-tree-item></pk-tree-item></pk-tree><pk-badge></pk-badge><pk-tab></pk-tab><pk-empty-state></pk-empty-state>');
        this.#ready = Promise.all([loadElements(scratch), loadElements(this)]);
    }

    async #start() {
        this.#unsubscribe?.(); this.#unsubscribe = null;
        try {
            await this.#ready;
            const src = this.getAttribute('src');
            const source = this.getAttribute('source');
            this.#provider ??= await createProvider({ source, src, base: this.getAttribute('base') ?? undefined, interval: Number(this.getAttribute('feed-interval')) || 0 });
            const caps = this.#provider.capabilities ?? {};
            this.querySelector('[data-ce-searchbox]').hidden = !caps.search;
            this.querySelector('[data-ce-search]').hidden = !caps.search;
            await this.#reload();
            if (this.isConnected && caps.live && this.#provider.subscribe) { this.#unsubscribe?.(); this.#unsubscribe = this.#provider.subscribe(ev => this.#onFeed(ev)); }
            const initial = this.getAttribute('initial');
            if (initial) await this.openFile(initial, { line: Number(this.getAttribute('initial-line')) || undefined });
            const query = this.getAttribute('search');
            if (query) await this.search(query);
        } catch (error) {
            log.error('the code explorer could not start', error);
            fill(this.querySelector('[data-ce-tree]'), `<pk-alert kind="danger">${esc(error.message)}</pk-alert>`);
            this.dispatchEvent(new CustomEvent('pk-code-explorer-error', { detail: { error } }));
        }
    }

    async #reload() {
        this.#files = await this.#provider.listFiles();
        this.#renderTree();
    }

    async #onFeed(ev) {
        if (ev?.path) this.#docs.delete(ev.path);
        await this.#reload();
        if (ev?.path && ev.path === this.#active) await this.openFile(ev.path, { line: this.#focus ?? undefined });
    }

    // The pane pk-workspace shows on a phone (on a wider screen every pane shows).
    #showPane(pane) { this.querySelector('[data-ce-root]').setAttribute('active-pane', pane); }

    // ---- nav -------------------------------------------------------------
    #renderTree() {
        const host = this.querySelector('[data-ce-tree]');
        this.querySelector('[data-ce-clear]').hidden = !this.#search && !this.#reports;
        if (this.#reports) { fill(host, this.#reportsHtml()); return; }
        if (this.#search) { fill(host, this.#searchHtml()); return; }
        const root = buildTree(this.#files, this.#filter);
        this.#nodes = new Map();
        const filtering = this.#filter.trim() !== '';
        if (!root.children.size) { fill(host, '<pk-text tone="muted">No files.</pk-text>'); return; }
        // The tree is connected empty and its items added after: a pk-tree that connects with items not yet upgraded updates against them too early.
        fill(host, `<pk-tree label="Files" value="${esc(this.#activeFile())}"></pk-tree>`);
        host.firstElementChild.append(this.#fragment(this.#treeHtml(root, filtering)));
        this.#upgrade();
    }

    // A folder's items. A folder that is not open yet holds one hidden stub item, which makes it expandable; its real children are
    // written when it opens (#onTreeToggle), so a snapshot of hundreds of files costs only the folders on screen.
    #treeHtml(node, filtering) {
        const sorted = [...node.children.values()].sort((a, b) => (!!a.file - !!b.file) || a.name.localeCompare(b.name));
        return sorted.map(n => {
            if (n.file && !n.children.size) {
                return `<pk-tree-item data-file value="${esc(n.path)}" label="${esc(n.name)}"><pk-cluster slot="label" justify="between" nowrap><pk-text inline>${esc(n.name)}</pk-text>${n.file.lines != null ? `<pk-badge variant="muted" max="999999" count="${n.file.lines}"></pk-badge>` : ''}</pk-cluster></pk-tree-item>`;
            }
            this.#nodes.set(n.path, n);
            const open = filtering || this.#folders.has(n.path);
            return `<pk-tree-item value="${esc(n.path)}" label="${esc(n.name)}"${open ? ' expanded' : ''}><pk-cluster slot="label" justify="between" nowrap><pk-text inline weight="semibold">${esc(n.name)}</pk-text><pk-badge variant="muted" max="999999" count="${n.count}"></pk-badge></pk-cluster>${open ? this.#treeHtml(n, filtering) : '<pk-tree-item data-ce-stub hidden label="."></pk-tree-item>'}</pk-tree-item>`;
        }).join('');
    }

    #fragment(markup) {
        const scratch = this.ownerDocument.createElement('template');
        fill(scratch, markup);
        return scratch.content;
    }

    #activeFile() { return this.#active === NAV ? '' : this.#active; }

    // The tree shows the open file as selected.
    #syncTree() { this.querySelector('pk-tree')?.setAttribute('value', this.#activeFile()); }

    #onTreeSelect(e) {
        const item = e.target.closest?.('pk-tree-item');
        if (!item) return;
        if (item.hasAttribute('data-file')) { this.openFile(e.detail.id); return; }
        item.setExpanded(!item.expanded);
        this.#syncTree();
    }

    #onTreeToggle(e) {
        const item = e.target.closest?.('pk-tree-item');
        if (!item || item.hasAttribute('data-file')) return;
        const path = e.detail.id;
        if (e.detail.expanded) this.#folders.add(path); else this.#folders.delete(path);
        const stub = item.querySelector(':scope > [data-ce-stub]');
        const node = this.#nodes.get(path);
        if (stub && node) {
            stub.replaceWith(this.#fragment(this.#treeHtml(node, false)));
            this.querySelector('pk-tree').requestUpdate?.();
            this.#upgrade();
        }
    }

    // Run a code search as if it were typed into the box; a no-op when the provider cannot search.
    async search(query) {
        const box = this.querySelector('[data-ce-query]');
        if (box) box.value = query;
        await this.#runSearch(query);
    }

    async #runSearch(query) {
        if (!query.trim() || !this.#provider.search) return;
        try { this.#search = { query, groups: await this.#provider.search(query) }; } catch (e) { log.warn('the search failed', e); this.#search = { query, groups: [], error: e.message }; }
        this.#renderTree();
    }

    // Toggle the reports picker (reports.js) in the nav pane: like search, it replaces the tree until "Back to files"
    // (data-ce-clear) clears it. Needs every file's content, which a lazy provider has not fetched yet -- read (and cache
    // in #docs) whatever is missing, one file at a time, the same way search already does for a lazy provider
    // (providers.js, #needAll). Three built-in reports (largest files, longest methods, duplicate blocks) are always
    // available; the host-defined pattern report is a fourth choice when `patterns` was set.
    async #toggleReports() {
        if (this.#reports) { this.#reports = null; this.#renderTree(); return; }
        try {
            const files = [];
            for (const f of this.#files) {
                if (!this.#docs.has(f.path)) {
                    const doc = await this.#provider.readFile(f.path);
                    const language = doc.language ?? languageOf(f.path);
                    this.#docs.set(f.path, { ...doc, language, tokens: tokenize(doc.lines, language) });
                }
                files.push(this.#docs.get(f.path));
            }
            this.#reports = {
                kind: this.#patterns.length ? 'pattern' : 'files',
                pattern: this.#patterns.length ? patternReport(files, this.#patterns) : null,
                files: largestFilesReport(files),
                methods: longestMethodsReport(files),
                duplicates: duplicateBlocksReport(files),
            };
        } catch (error) {
            log.warn('the reports could not be computed', error);
            this.#reports = { kind: 'files', pattern: null, files: [], methods: [], duplicates: [], error: error.message };
        }
        this.#search = null;
        this.#renderTree();
    }

    // The choices shown by the reports picker: only "Patterns" is conditional (needs host-defined patterns).
    #reportKinds() {
        const r = this.#reports;
        return [
            r.pattern && { key: 'pattern', label: 'Patterns' },
            { key: 'files', label: 'Largest files' },
            { key: 'methods', label: 'Longest methods' },
            { key: 'duplicates', label: 'Duplicate blocks' },
        ].filter(Boolean);
    }

    #reportsHtml() {
        const r = this.#reports;
        if (r.error) return `<pk-alert kind="danger">${esc(r.error)}</pk-alert>`;
        const kinds = this.#reportKinds();
        const picker = `<div class="csr-kinds">${kinds.map(k => `<button type="button" class="csr-kind${k.key === r.kind ? ' csr-kind--active' : ''}" data-kind="${k.key}" aria-pressed="${k.key === r.kind}">${k.label}</button>`).join('')}</div>`;
        return picker + this.#reportRowsHtml(r.kind, r[r.kind] ?? []);
    }

    #reportRowsHtml(kind, rows) {
        if (!rows.length) return '<pk-text tone="muted">No matches.</pk-text>';
        if (kind === 'duplicates') {
            return `<div class="csr">${rows.map(d => `<div class="csr-group"><div class="csr-title">${d.length} lines duplicated in ${d.locations.length} places</div>${d.locations.map(l => `<button type="button" class="csr-hit" data-path="${esc(l.path)}" data-line="${l.line}"><span class="csr-no">${l.line}</span><span class="csr-text">${esc(l.path)}</span></button>`).join('')}</div>`).join('')}</div>`;
        }
        return `<div class="csr">${rows.map(x => {
            const label = kind === 'pattern' ? `${esc(x.name)}${x.label ? ` — ${esc(x.label)}` : ''}: ${esc(x.path)}`
                : kind === 'methods' ? `${esc(x.name)} — ${esc(x.path)}`
                    : esc(x.path);
            return `<button type="button" class="csr-hit" data-path="${esc(x.path)}" data-line="${x.line ?? ''}"><span class="csr-no">${x.count}</span><span class="csr-text">${label}</span></button>`;
        }).join('')}</div>`;
    }

    #searchHtml() {
        const s = this.#search;
        if (s.error) return `<pk-alert kind="danger">${esc(s.error)}</pk-alert>`;
        if (!s.groups.length) return '<pk-text tone="muted">No matches.</pk-text>';
        const match = matcherFor(s.query);
        return `<div class="csr">${s.groups.map(g => `<div class="csr-group"><div class="csr-title">${esc(g.path)} <pk-text inline tone="muted">(${g.hits.length})</pk-text></div>${g.hits.map(h => {
            const t = h.text.trim(); const shift = h.text.length - h.text.trimStart().length;
            const spans = (h.spans ?? match(h.text)).map(x => ({ start: x.start - shift, length: x.length }));
            return `<button type="button" class="csr-hit" data-path="${esc(g.path)}" data-line="${h.line}"><span class="csr-no">${h.line}</span><span class="csr-text">${buildSegments(t, [], spans, []).map(x => x.match ? `<mark>${esc(x.text)}</mark>` : esc(x.text)).join('')}</span></button>`;
        }).join('')}</div>`).join('')}</div>`;
    }

    // A search or report hit in the nav pane opens its file at that line; a report-kind button switches which report is shown.
    #onHitClick(e) {
        const kindBtn = e.target.closest?.('.csr-kind');
        if (kindBtn) { this.#reports.kind = kindBtn.dataset.kind; this.#renderTree(); return; }
        const hit = e.target.closest?.('.csr-hit');
        if (hit) this.openFile(hit.dataset.path, { line: hit.dataset.line ? Number(hit.dataset.line) : undefined });
    }

    // ---- tabs ------------------------------------------------------------
    #renderTabs() {
        const strip = this.querySelector('[data-ce-tabs]');
        fill(strip, this.#open.map(p => `<pk-tab value="${esc(p)}" closable title="${esc(p)}">${esc(p.split('/').pop())}</pk-tab>`).join(''));
        strip.toggleAttribute('none-active', !this.#open.length);
        strip.setAttribute('value', this.#activeFile());
        this.#upgrade();
    }

    #closeTab(path, refocus = false) {
        const i = this.#open.indexOf(path);
        if (i < 0) return;
        this.#open = this.#open.filter(p => p !== path);
        if (this.#active === path) this.#active = this.#open[Math.min(i, this.#open.length - 1)] ?? NAV;
        this.#renderTabs(); this.#renderPane(); this.#syncTree();
        if (this.#active === NAV) this.#showPane('nav');
        if (refocus) requestAnimationFrame(() => this.querySelector('pk-tab[selected]')?.focus());
    }

    async openFile(path, { line } = {}) {
        try {
            if (!this.#docs.has(path)) {
                const doc = await this.#provider.readFile(path);
                const language = doc.language ?? languageOf(path);
                this.#docs.set(path, { ...doc, language, tokens: tokenize(doc.lines, language) });
            }
        } catch (error) {
            log.warn(`could not open ${path}`, error);
            this.dispatchEvent(new CustomEvent('pk-code-explorer-error', { detail: { error } }));
            return;
        }
        const isNew = !this.#open.includes(path);
        if (isNew) this.#open.push(path);
        this.#active = path; this.#focus = line ?? null; this.#word = '';
        if (isNew) this.#renderTabs(); else this.querySelector('[data-ce-tabs]').setAttribute('value', path);
        this.#renderPane(); this.#syncTree(); this.#showPane('main');
        if (this.#inspector?.kind === 'outline') this.#showOutline(false);
        this.dispatchEvent(new CustomEvent('pk-code-explorer-open', { detail: { path } }));
    }

    // ---- viewer ----------------------------------------------------------
    #renderPane() {
        const pane = this.querySelector('[data-ce-pane]');
        const doc = this.#docs.get(this.#active);
        if (!doc) { fill(pane, '<pk-empty-state heading="No file open" description="Pick a file from the tree."></pk-empty-state>'); this.#upgrade(); this.#renderInspector(); return; }
        const max = Number(this.getAttribute('max-lines')) || 2000;
        const total = doc.lines.length;
        const centre = this.#focus ?? 1;
        const start = total <= max ? 1 : Math.max(1, Math.min(centre - Math.floor(max / 2), total - max + 1));
        const end = Math.min(total, start + max - 1);
        const caps = this.#provider.capabilities ?? {};
        fill(pane, `<div class="cv cv--fill"><div class="cv-title"><span class="cv-name">${esc(doc.path)}</span><span class="cv-meta"><span class="cv-lang">${esc(doc.language)}</span><span class="cv-count">${total.toLocaleString()} lines</span></span>${caps.outline ? '<pk-button size="mini" variant="ghost" data-ce-outline>Outline</pk-button>' : ''}${caps.references && this.#word ? `<pk-button size="mini" variant="ghost" data-ce-usages>Usages of ${esc(this.#word)}</pk-button>` : ''}</div>${start > 1 || end < total ? `<div class="cv-notice">Showing lines ${start}-${end} of ${total}.</div>` : ''}<pk-code-view class="cv-scroll" label="${esc(doc.path)}"></pk-code-view></div>`);
        const view = pane.querySelector('pk-code-view'), shown = doc.lines.slice(start - 1, end);
        Object.assign(view, { start, lines: shown, highlight: this.#focus ? String(this.#focus) : '', segments: shown.map((text, i) => buildSegments(text, doc.tokens[start - 1 + i] ?? [], [], wordSpans(text, this.#word))) });
        on(view, 'pk-line-click', e => this.#onLineClick(e.detail));
        this.#upgrade();
        this.#renderInspector();
    }

    #onPaneClick(e) {
        if (e.target.closest('[data-ce-outline]')) return this.#showOutline();
        if (e.target.closest('[data-ce-usages]')) return this.#showUsages();
    }

    // A click in the code viewer: toggle the word under the caret as the selected word and focus its line.
    #onLineClick({ line, column }) {
        const word = wordAt(this.#docs.get(this.#active).lines[line - 1], column);
        this.#word = word === this.#word ? '' : word; this.#focus = line;
        this.#renderPane();
    }

    // ---- inspector -------------------------------------------------------
    async #showOutline(toPane = true) {
        try { this.#inspector = { kind: 'outline', items: await this.#provider.outline(this.#active) }; } catch (e) { log.warn('the outline could not be read', e); this.#inspector = { kind: 'outline', items: [], error: e.message }; }
        this.#renderInspector(); if (toPane) this.#showPane('aside');
    }

    async #showUsages() {
        try { this.#inspector = { kind: 'usages', word: this.#word, items: await this.#provider.references(this.#active, this.#word) }; } catch (e) { log.warn('the usages could not be read', e); this.#inspector = { kind: 'usages', word: this.#word, items: [], error: e.message }; }
        this.#renderInspector(); this.#showPane('aside');
    }

    #renderInspector() {
        const i = this.#inspector;
        const shown = Boolean(i) && Boolean(this.#docs.get(this.#active));
        this.querySelector('[data-ce-root]').toggleAttribute('aside-open', shown);
        if (!shown) return;
        this.querySelector('[data-ce-inspector-title]').textContent = i.kind === 'outline' ? 'Outline' : `Usages of ${i.word}`;
        const body = this.querySelector('[data-ce-inspector-body]');
        if (i.error) { fill(body, `<pk-alert kind="danger">${esc(i.error)}</pk-alert>`); return; }
        if (!i.items.length) { fill(body, `<pk-text tone="muted">${i.kind === 'outline' ? 'Nothing to outline in this file.' : 'No usages found.'}</pk-text>`); return; }
        fill(body, i.kind === 'outline'
            ? `<ul class="co">${i.items.map(x => `<li><button type="button" class="co-item co-d${Math.min(Math.max(x.depth ?? 0, 0), 3)}" data-line="${x.line}"><span class="co-kind">${esc(x.kind)}</span><span class="co-name">${esc(x.name)}</span><span class="co-line">${x.line}</span></button></li>`).join('')}</ul>`
            : `<div class="csr">${i.items.map(x => `<button type="button" class="csr-hit" data-path="${esc(x.path)}" data-line="${x.line}"><span class="csr-no">${x.line}</span><span class="csr-text">${esc(x.path)}: ${esc(x.text.trim())}</span></button>`).join('')}</div>`);
    }

    #onInspectorClick(e) {
        const b = e.target.closest('[data-line]');
        if (!b) return;
        this.openFile(b.dataset.path ?? this.#active, { line: Number(b.dataset.line) });
    }
}

export function defineCodeExplorer(registry = globalThis.customElements) {
    if (globalThis.HTMLElement && registry && !registry.get('pk-code-explorer')) registry.define('pk-code-explorer', CodeExplorerElement);
}

defineCodeExplorer();
