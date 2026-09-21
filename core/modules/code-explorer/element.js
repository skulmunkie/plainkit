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
// a ready provider object. Events: "pk-code-explorer-open" (detail { path }), "pk-code-explorer-error" (detail { error }).
// Phone: below 640px pk-workspace shows one pane at a time (Files, Code, Inspector) with its own tab strip.

import { createProvider, wordSpans, matcherFor } from './providers.js';
import { buildSegments, tokenize, wordAt, languageOf } from './tokenize.js';
import { ensureStyles, styleUrls } from '../../js/mount-support.js';
import { loadElements } from '../../js/loader.js';
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
    #inspector = null;
    #folders = new Set();
    #nodes = new Map();
    #ready = Promise.resolve();
    #unsubscribe = null;

    set provider(p) { this.#provider = p; if (this.isConnected) this.#start(); }
    get provider() { return this.#provider; }

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
        if (h) this.style.setProperty('--pk-code-explorer-height', h === 'fill' ? '100%' : h);
    }

    // Load the modules of any pk-* element that was just written and is not defined yet (a no-op once they all are).
    #upgrade() { loadElements(this); }

    #build() {
        fill(this, `
<pk-workspace fill active-pane="nav" nav-label="Files" main-label="Code" aside-label="Inspector" data-ce-root>
  <div slot="nav" class="ce-nav">
    <pk-input type="search" label="Filter files" placeholder="Filter files by path" data-ce-filter></pk-input>
    <pk-input type="search" label="Search code" placeholder="Search code: text or /regex/" data-ce-query data-ce-searchbox></pk-input>
    <div class="ce-actions">
      <pk-button size="mini" data-ce-search hidden>Search</pk-button>
      <pk-button size="mini" variant="ghost" data-ce-clear hidden>Back to files</pk-button>
    </div>
    <div data-ce-tree></div>
  </div>
  <div class="ce-main">
    <pk-tabs scroll none-active data-ce-tabs></pk-tabs>
    <div class="ce-pane" data-ce-pane></div>
  </div>
  <div slot="aside" class="ce-aside" data-ce-inspector>
    <div class="ce-aside-head"><h2 data-ce-inspector-title>Outline</h2><pk-button size="mini" variant="ghost" icon label="Close inspector" data-ce-inspector-close icon-name="x"></pk-button></div>
    <div data-ce-inspector-body></div>
  </div>
</pk-workspace>`);
        const $ = s => this.querySelector(s);
        $('[data-ce-filter]').addEventListener('input', e => { this.#filter = e.target.value; this.#renderTree(); });
        const runSearch = () => this.#runSearch($('[data-ce-query]').value);
        $('[data-ce-query]').addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); });
        $('[data-ce-search]').addEventListener('click', runSearch);
        $('[data-ce-clear]').addEventListener('click', () => { this.#search = null; this.#renderTree(); });
        $('[data-ce-inspector-close]').addEventListener('click', () => { this.#inspector = null; this.#renderInspector(); this.#showPane('main'); });
        const tree = $('[data-ce-tree]');
        tree.addEventListener('click', e => this.#onHitClick(e));
        tree.addEventListener('pk-select', e => this.#onTreeSelect(e));
        tree.addEventListener('pk-toggle', e => this.#onTreeToggle(e));
        const tabs = $('[data-ce-tabs]');
        tabs.addEventListener('pk-tab-change', e => { if (e.detail.fallback) return; this.#active = e.detail.value; this.#focus = null; this.#renderPane(); this.#syncTree(); });
        tabs.addEventListener('pk-tab-close', e => this.#closeTab(e.detail.value));
        tabs.addEventListener('keydown', e => { const tab = e.target.closest?.('pk-tab'); if (tab && e.key === 'Delete') this.#closeTab(tab.value, true); });
        $('[data-ce-pane]').addEventListener('click', e => this.#onPaneClick(e));
        $('[data-ce-inspector-body]').addEventListener('click', e => this.#onInspectorClick(e));
        this.addEventListener('keydown', e => { if (e.key === 'Escape' && this.#inspector) { this.#inspector = null; this.#renderInspector(); this.#showPane('main'); } });
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
            fill(this.querySelector('[data-ce-tree]'), `<p class="ce-error" role="alert">${esc(error.message)}</p>`);
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
        this.querySelector('[data-ce-clear]').hidden = !this.#search;
        if (this.#search) { fill(host, this.#searchHtml()); return; }
        const root = buildTree(this.#files, this.#filter);
        this.#nodes = new Map();
        const filtering = this.#filter.trim() !== '';
        if (!root.children.size) { fill(host, '<p class="ce-muted ce-empty">No files.</p>'); return; }
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
                return `<pk-tree-item data-file value="${esc(n.path)}" label="${esc(n.name)}"><span slot="label" class="ce-row"><span class="ce-name">${esc(n.name)}</span>${n.file.lines != null ? `<pk-badge variant="muted" max="999999" count="${n.file.lines}"></pk-badge>` : ''}</span></pk-tree-item>`;
            }
            this.#nodes.set(n.path, n);
            const open = filtering || this.#folders.has(n.path);
            return `<pk-tree-item value="${esc(n.path)}" label="${esc(n.name)}"${open ? ' expanded' : ''}><span slot="label" class="ce-row"><span class="ce-name ce-folder">${esc(n.name)}</span><pk-badge variant="muted" max="999999" count="${n.count}"></pk-badge></span>${open ? this.#treeHtml(n, filtering) : '<pk-tree-item data-ce-stub hidden label="."></pk-tree-item>'}</pk-tree-item>`;
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

    #searchHtml() {
        const s = this.#search;
        if (s.error) return `<p class="ce-error" role="alert">${esc(s.error)}</p>`;
        if (!s.groups.length) return '<p class="ce-muted">No matches.</p>';
        const match = matcherFor(s.query);
        return `<div class="csr">${s.groups.map(g => `<div class="csr-group"><div class="csr-title">${esc(g.path)} <span class="ce-muted">(${g.hits.length})</span></div>${g.hits.map(h => {
            const t = h.text.trim(); const shift = h.text.length - h.text.trimStart().length;
            const spans = (h.spans ?? match(h.text)).map(x => ({ start: x.start - shift, length: x.length }));
            return `<button type="button" class="csr-hit" data-path="${esc(g.path)}" data-line="${h.line}"><span class="csr-no">${h.line}</span><span class="csr-text">${buildSegments(t, [], spans, []).map(x => x.match ? `<mark>${esc(x.text)}</mark>` : esc(x.text)).join('')}</span></button>`;
        }).join('')}</div>`).join('')}</div>`;
    }

    // A search hit in the nav pane opens its file at that line.
    #onHitClick(e) {
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
        const rows = [];
        for (let n = start; n <= end; n++) {
            const text = doc.lines[n - 1];
            const segs = buildSegments(text, doc.tokens[n - 1] ?? [], [], wordSpans(text, this.#word));
            rows.push(`<div class="cv-row${n === this.#focus ? ' cv-row--focus' : ''}" data-line="${n}"><span class="cv-no">${n}</span><span class="cv-code">${segs.map(s => {
                const cls = [s.kind !== 'plain' ? `tk-${s.kind}` : '', s.match ? 'cv-match' : '', s.word ? 'cv-word' : ''].filter(Boolean).join(' ');
                return cls ? `<span class="${cls}">${esc(s.text)}</span>` : esc(s.text);
            }).join('')}</span></div>`);
        }
        fill(pane, `<div class="cv cv--fill"><div class="cv-title"><span class="cv-name">${esc(doc.path)}</span><span class="cv-meta"><span class="cv-lang">${esc(doc.language)}</span><span class="cv-count">${total.toLocaleString()} lines</span></span>${caps.outline ? '<pk-button size="mini" variant="ghost" data-ce-outline>Outline</pk-button>' : ''}${caps.references && this.#word ? `<pk-button size="mini" variant="ghost" data-ce-usages>Usages of ${esc(this.#word)}</pk-button>` : ''}</div>${start > 1 || end < total ? `<div class="cv-notice">Showing lines ${start}-${end} of ${total}.</div>` : ''}<div class="cv-scroll" tabindex="0">${rows.join('')}</div></div>`);
        this.#upgrade();
        if (this.#focus) pane.querySelector('.cv-row--focus')?.scrollIntoView({ block: 'center' });
        this.#renderInspector();
    }

    #onPaneClick(e) {
        if (e.target.closest('[data-ce-outline]')) return this.#showOutline();
        if (e.target.closest('[data-ce-usages]')) return this.#showUsages();
        const row = e.target.closest('.cv-row'); const code = e.target.closest('.cv-code');
        const sel = this.ownerDocument.defaultView.getSelection();
        if (!row || !code || !sel?.anchorNode || !sel.isCollapsed) return;
        let col = sel.anchorOffset;
        const walker = this.ownerDocument.createTreeWalker(code, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n && n !== sel.anchorNode; n = walker.nextNode()) col += n.textContent.length;
        const line = Number(row.dataset.line);
        const word = wordAt(this.#docs.get(this.#active).lines[line - 1], col);
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
        if (i.error) { fill(body, `<p class="ce-error" role="alert">${esc(i.error)}</p>`); return; }
        if (!i.items.length) { fill(body, `<p class="ce-muted">${i.kind === 'outline' ? 'Nothing to outline in this file.' : 'No usages found.'}</p>`); return; }
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
