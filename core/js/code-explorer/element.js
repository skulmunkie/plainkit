// <code-explorer> custom element: a file tree, a tab strip of open files, a line-numbered code viewer and a docked
// outline / usages inspector, fed by one provider (see providers.js). Light DOM, so the SDK stylesheet styles it.
//
//   <code-explorer source="snapshot" src="snapshot.json"></code-explorer>
//   <code-explorer source="api" src="./api/code" theme="light" height="40rem"></code-explorer>
//   <code-explorer source="feed" src="./api/code/events" base="./api/code" feed-interval="5000"></code-explorer>
//
// Attributes (all optional except source/src unless a provider is assigned): source, src, base (feed only), theme
// (light|dark, sets data-theme), height (any CSS length, or "fill"; default 32rem), initial (a path to open first; initial-line focuses a row),
// search (a query to run once the files are listed), max-lines (rows drawn per file, default 2000), feed-interval (ms; polls instead of SSE). Property `provider` accepts
// a ready provider object. Events: "code-explorer-open" (detail { path }), "code-explorer-error" (detail { error }).
// Phone: below 640px the tab strip carries a phone-only Files tab and one panel shows at a time (workspace.css).
// The layout comes from workspace.css and code-explorer.css; no styles are injected here.

import { createProvider, wordSpans, matcherFor } from './providers.js';
import { buildSegments, tokenize, wordAt, languageOf } from './tokenize.js';

const NAV = '::nav';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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
    #unsubscribe = null;

    set provider(p) { this.#provider = p; if (this.isConnected) this.#start(); }
    get provider() { return this.#provider; }

    connectedCallback() {
        this.#applyAttributes();
        this.#build();
        this.#start();
    }

    disconnectedCallback() { this.#unsubscribe?.(); this.#unsubscribe = null; }

    attributeChangedCallback() { if (this.isConnected) this.#applyAttributes(); }

    #applyAttributes() {
        const theme = this.getAttribute('theme');
        if (theme) this.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
        const h = this.getAttribute('height');
        if (h) this.style.setProperty('--code-explorer-height', h === 'fill' ? '100%' : h);
    }

    #build() {
        this.innerHTML = `
<div class="workspace workspace--fill workspace--nav" data-ce-root>
  <aside class="workspace-nav u-p-p75r-1r" aria-label="Files">
    <label class="ff"><span>Filter files</span><input type="search" data-ce-filter placeholder="part of a path"></label>
    <label class="ff" data-ce-searchbox><span>Search code</span><input type="search" data-ce-query placeholder="text or /regex/"></label>
    <div class="cluster cluster--horizontal cluster--gap-sm cluster--align-center cluster--justify-start">
      <button type="button" class="btn-mini btn-primary" data-ce-search hidden>Search</button>
      <button type="button" class="btn-mini btn-ghost" data-ce-clear hidden>Back to files</button>
    </div>
    <div data-ce-tree></div>
  </aside>
  <main class="workspace-main">
    <div class="tabs tabs--scroll" role="tablist" data-pk-tabs data-ce-tabs></div>
    <div class="workspace-pane" data-ce-pane></div>
    <div class="flyout-panel flyout-panel--docked" data-ce-inspector hidden role="complementary" aria-label="Inspector">
      <header class="flyout-header"><h2 data-ce-inspector-title>Outline</h2><button type="button" class="btn-mini btn-ghost flyout-close" aria-label="Close inspector" data-ce-inspector-close>&#10005;</button></header>
      <div class="flyout-body" data-ce-inspector-body></div>
    </div>
  </main>
</div>`;
        const $ = s => this.querySelector(s);
        $('[data-ce-filter]').addEventListener('input', e => { this.#filter = e.target.value; this.#renderTree(); });
        const runSearch = () => this.#runSearch($('[data-ce-query]').value);
        $('[data-ce-query]').addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); });
        $('[data-ce-search]').addEventListener('click', runSearch);
        $('[data-ce-clear]').addEventListener('click', () => { this.#search = null; this.#renderTree(); });
        $('[data-ce-inspector-close]').addEventListener('click', () => { this.#inspector = null; this.#renderInspector(); });
        $('[data-ce-tree]').addEventListener('click', e => this.#onTreeClick(e));
        $('[data-ce-tabs]').addEventListener('click', e => this.#onTabClick(e));
        $('[data-ce-pane]').addEventListener('click', e => this.#onPaneClick(e));
        $('[data-ce-inspector-body]').addEventListener('click', e => this.#onInspectorClick(e));
        this.addEventListener('keydown', e => { if (e.key === 'Escape' && this.#inspector) { this.#inspector = null; this.#renderInspector(); } });
    }

    async #start() {
        this.#unsubscribe?.(); this.#unsubscribe = null;
        try {
            const src = this.getAttribute('src');
            const source = this.getAttribute('source');
            this.#provider ??= await createProvider({ source, src, base: this.getAttribute('base') ?? undefined, interval: Number(this.getAttribute('feed-interval')) || 0 });
            const caps = this.#provider.capabilities ?? {};
            this.querySelector('[data-ce-searchbox]').hidden = !caps.search;
            this.querySelector('[data-ce-search]').hidden = !caps.search;
            await this.#reload();
            if (caps.live && this.#provider.subscribe) this.#unsubscribe = this.#provider.subscribe(ev => this.#onFeed(ev));
            const initial = this.getAttribute('initial');
            if (initial) await this.openFile(initial, { line: Number(this.getAttribute('initial-line')) || undefined });
            const query = this.getAttribute('search');
            if (query) await this.search(query);
        } catch (error) {
            this.querySelector('[data-ce-tree]').innerHTML = `<p class="form-error" role="alert">${esc(error.message)}</p>`;
            this.dispatchEvent(new CustomEvent('code-explorer-error', { detail: { error } }));
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

    // ---- nav -------------------------------------------------------------
    #renderTree() {
        const host = this.querySelector('[data-ce-tree]');
        this.querySelector('[data-ce-clear]').hidden = !this.#search;
        if (this.#search) { host.innerHTML = this.#searchHtml(); return; }
        const root = buildTree(this.#files, this.#filter);
        const filtering = this.#filter.trim() !== '';
        const list = node => `<ul class="ft-list">${[...node.children.values()].sort((a, b) => (!!a.file - !!b.file) || a.name.localeCompare(b.name)).map(n => n.file && !n.children.size
            ? `<li><button type="button" class="ft-row ft-file${n.path === this.#active ? ' ft-selected' : ''}" data-path="${esc(n.path)}"><span class="ft-name">${esc(n.name)}</span><span class="ft-lines muted">${n.file.lines ?? ''}</span></button></li>`
            : `<li><button type="button" class="ft-row ft-folder" data-folder="${esc(n.path)}" aria-expanded="${filtering || this.#folders.has(n.path)}"><span class="ft-caret" aria-hidden="true">${filtering || this.#folders.has(n.path) ? '&#9662;' : '&#9656;'}</span>${esc(n.name)}<span class="ft-count muted">${n.count}</span></button>${filtering || this.#folders.has(n.path) ? list(n) : ''}</li>`).join('')}</ul>`;
        host.innerHTML = root.children.size ? `<div class="ft">${list(root)}</div>` : '<p class="muted ft-empty">No files.</p>';
    }

    // Run a code search as if it were typed into the box; a no-op when the provider cannot search.
    async search(query) {
        const box = this.querySelector('[data-ce-query]');
        if (box) box.value = query;
        await this.#runSearch(query);
    }

    async #runSearch(query) {
        if (!query.trim() || !this.#provider.search) return;
        try { this.#search = { query, groups: await this.#provider.search(query) }; } catch (e) { this.#search = { query, groups: [], error: e.message }; }
        this.#renderTree();
    }

    #searchHtml() {
        const s = this.#search;
        if (s.error) return `<p class="form-error" role="alert">${esc(s.error)}</p>`;
        if (!s.groups.length) return '<p class="muted">No matches.</p>';
        const match = matcherFor(s.query);
        return `<div class="csr">${s.groups.map(g => `<div class="csr-group"><div class="csr-title">${esc(g.path)} <span class="muted">(${g.hits.length})</span></div>${g.hits.map(h => {
            const t = h.text.trim(); const shift = h.text.length - h.text.trimStart().length;
            const spans = (h.spans ?? match(h.text)).map(x => ({ start: x.start - shift, length: x.length }));
            return `<button type="button" class="csr-hit" data-path="${esc(g.path)}" data-line="${h.line}"><span class="csr-no">${h.line}</span><span class="csr-text">${buildSegments(t, [], spans, []).map(x => x.match ? `<mark>${esc(x.text)}</mark>` : esc(x.text)).join('')}</span></button>`;
        }).join('')}</div>`).join('')}</div>`;
    }

    #onTreeClick(e) {
        const folder = e.target.closest('[data-folder]');
        if (folder) { const p = folder.dataset.folder; this.#folders.has(p) ? this.#folders.delete(p) : this.#folders.add(p); this.#renderTree(); return; }
        const file = e.target.closest('[data-path]');
        if (file) this.openFile(file.dataset.path, { line: file.dataset.line ? Number(file.dataset.line) : undefined });
    }

    // ---- tabs ------------------------------------------------------------
    #renderTabs() {
        const nav = `<button type="button" class="tab tab--phone-only${this.#active === NAV ? ' active' : ''}" role="tab" aria-selected="${this.#active === NAV}" tabindex="${this.#active === NAV ? 0 : -1}" data-tab="${NAV}">Files</button>`;
        this.querySelector('[data-ce-tabs]').innerHTML = nav + this.#open.map(p => {
            const on = p === this.#active;
            return `<button type="button" class="tab${on ? ' active' : ''}" role="tab" aria-selected="${on}" tabindex="${on ? 0 : -1}" data-tab="${esc(p)}" title="${esc(p)}">${esc(p.split('/').pop())}</button><button type="button" class="tab-close" aria-label="Close ${esc(p)}" data-close="${esc(p)}">&#10005;</button>`;
        }).join('');
        const active = this.querySelector('[data-ce-tabs] .tab.active');
        const strip = this.querySelector('[data-ce-tabs]');
        if (active) strip.scrollLeft = Math.max(0, active.offsetLeft - 8);
        this.querySelector('[data-ce-root]').classList.toggle('workspace--nav', this.#active === NAV);
    }

    #onTabClick(e) {
        const close = e.target.closest('[data-close]');
        if (close) {
            const path = close.dataset.close; const i = this.#open.indexOf(path);
            this.#open = this.#open.filter(p => p !== path);
            if (this.#active === path) this.#active = this.#open[Math.min(i, this.#open.length - 1)] ?? NAV;
            this.#renderTabs(); this.#renderPane(); this.#renderTree();
            return;
        }
        const tab = e.target.closest('[data-tab]');
        if (tab) { this.#active = tab.dataset.tab; this.#focus = null; this.#renderTabs(); this.#renderPane(); this.#renderTree(); }
    }

    async openFile(path, { line } = {}) {
        try {
            if (!this.#docs.has(path)) {
                const doc = await this.#provider.readFile(path);
                const language = doc.language ?? languageOf(path);
                this.#docs.set(path, { ...doc, language, tokens: tokenize(doc.lines, language) });
            }
        } catch (error) {
            this.dispatchEvent(new CustomEvent('code-explorer-error', { detail: { error } }));
            return;
        }
        if (!this.#open.includes(path)) this.#open.push(path);
        this.#active = path; this.#focus = line ?? null; this.#word = '';
        this.#renderTabs(); this.#renderPane(); this.#renderTree();
        if (this.#inspector?.kind === 'outline') this.#showOutline();
        this.dispatchEvent(new CustomEvent('code-explorer-open', { detail: { path } }));
    }

    // ---- viewer ----------------------------------------------------------
    #renderPane() {
        const pane = this.querySelector('[data-ce-pane]');
        const doc = this.#docs.get(this.#active);
        if (!doc) { pane.innerHTML = '<div class="empty-state"><p class="empty-state-title">No file open</p><p class="empty-state-description">Pick a file from the tree.</p></div>'; this.#renderInspector(); return; }
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
        pane.innerHTML = `<div class="cv cv--fill"><div class="cv-title"><span class="cv-name">${esc(doc.path)}</span><span class="cv-meta"><span class="cv-lang">${esc(doc.language)}</span><span class="cv-count">${total.toLocaleString()} lines</span></span>${caps.outline ? '<button type="button" class="btn-mini btn-ghost" data-ce-outline>Outline</button>' : ''}${caps.references && this.#word ? `<button type="button" class="btn-mini btn-ghost" data-ce-usages>Usages of ${esc(this.#word)}</button>` : ''}</div>${start > 1 || end < total ? `<div class="cv-notice">Showing lines ${start}-${end} of ${total}.</div>` : ''}<div class="cv-scroll" tabindex="0">${rows.join('')}</div></div>`;
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
    async #showOutline() {
        try { this.#inspector = { kind: 'outline', items: await this.#provider.outline(this.#active) }; } catch (e) { this.#inspector = { kind: 'outline', items: [], error: e.message }; }
        this.#renderInspector();
    }

    async #showUsages() {
        try { this.#inspector = { kind: 'usages', word: this.#word, items: await this.#provider.references(this.#active, this.#word) }; } catch (e) { this.#inspector = { kind: 'usages', word: this.#word, items: [], error: e.message }; }
        this.#renderInspector();
    }

    #renderInspector() {
        const box = this.querySelector('[data-ce-inspector]');
        const i = this.#inspector;
        box.hidden = !i || !this.#docs.get(this.#active);
        if (box.hidden) return;
        this.querySelector('[data-ce-inspector-title]').textContent = i.kind === 'outline' ? 'Outline' : `Usages of ${i.word}`;
        const body = this.querySelector('[data-ce-inspector-body]');
        if (i.error) { body.innerHTML = `<p class="form-error" role="alert">${esc(i.error)}</p>`; return; }
        if (!i.items.length) { body.innerHTML = `<p class="muted">${i.kind === 'outline' ? 'Nothing to outline in this file.' : 'No usages found.'}</p>`; return; }
        body.innerHTML = i.kind === 'outline'
            ? `<ul class="co">${i.items.map(x => `<li><button type="button" class="co-item co-d${Math.min(Math.max(x.depth ?? 0, 0), 3)}" data-line="${x.line}"><span class="co-kind">${esc(x.kind)}</span><span class="co-name">${esc(x.name)}</span><span class="muted co-line">${x.line}</span></button></li>`).join('')}</ul>`
            : `<div class="csr">${i.items.map(x => `<button type="button" class="csr-hit" data-path="${esc(x.path)}" data-line="${x.line}"><span class="csr-no">${x.line}</span><span class="csr-text">${esc(x.path)}: ${esc(x.text.trim())}</span></button>`).join('')}</div>`;
    }

    #onInspectorClick(e) {
        const b = e.target.closest('[data-line]');
        if (!b) return;
        this.openFile(b.dataset.path ?? this.#active, { line: Number(b.dataset.line) });
    }
}

export function defineCodeExplorer(registry = globalThis.customElements) {
    if (globalThis.HTMLElement && registry && !registry.get('code-explorer')) registry.define('code-explorer', CodeExplorerElement);
}

defineCodeExplorer();
