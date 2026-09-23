// Code explorer data providers. One interface, four sources; the UI asks the provider what it can do and hides the rest.
//
//   provider.capabilities  { search, outline, references, live }   booleans; list and read are always available
//   provider.listFiles()   -> [{ path, lines, language? }]
//   provider.readFile(p)   -> { path, language?, lines: string[] }
//   provider.search(q)     -> [{ path, hits: [{ line, text }] }]        only when capabilities.search
//   provider.outline(p)    -> [{ kind, name, line, depth, detail? }]     only when capabilities.outline
//   provider.references(p, word) -> [{ path, line, text }]              only when capabilities.references
//   provider.subscribe(cb) -> unsubscribe()                             only when capabilities.live;
//                             cb({ type: 'changed' | 'added' | 'removed', path? }) -- omit path to mean "reload the list"
//
// Snapshot file (one JSON document): { "version": 1, "generated": "ISO date", "files": [ { "path", "language"?,
//   "content": "text", "symbols"?: [ { kind, name, line, depth } ] } ] }
//
// API contract (relative to the configured base URL; every response is JSON):
//   GET capabilities            -> { search, outline, references, live }     optional; missing means list + read only
//   GET files                   -> [{ path, lines, language? }]
//   GET file?path=P             -> { path, language?, lines: string[] }  (or { content: "text" })
//   GET search?q=Q              -> [{ path, hits: [{ line, text }] }]
//   GET outline?path=P          -> [{ kind, name, line, depth, detail? }]
//   GET references?path=P&word=W-> [{ path, line, text }]
// Feed: a Server-Sent Events URL (or, with interval, a polled JSON URL) that emits { type, path? } messages; reads still
// come from the wrapped provider.
//
// Lazy (issue 196): the live site's own default. A lean file list (site/files/index.json: path, language, line count, no
// content) fetched once up front, plus a same-origin `raw` base (the Pages deploy's own copy of the source tree, resolved with
// a URL object against the calling page's own module in site/files/page.js) each file's real text is fetched from on demand
// and cached -- STANDARDS.md, "Security (CSP)": no runtime request to another origin, so this only ever works same-origin,
// unlike an ApiProvider pointed at someone else's host. search/outline/references need a file's content, so the first call to
// any of them fetches whatever is not cached yet.
//
// Framework-free; `fetch` and `EventSource` are injectable so the contract can be tested without a browser.

import { createLogger } from '../../js/log.js';
import { symbolsOf } from './symbols.js';

const log = createLogger('code-explorer');

export const NO_CAPABILITIES = Object.freeze({ search: false, outline: false, references: false, live: false });

const WORD = /[A-Za-z0-9_$]/;

// Whole-word occurrences of `word` in `text`: [{ start, length }].
export function wordSpans(text, word) {
    const spans = [];
    if (!word) return spans;
    for (let i = text.indexOf(word); i !== -1; i = text.indexOf(word, i + 1)) {
        if (!(i > 0 && WORD.test(text[i - 1])) && !(i + word.length < text.length && WORD.test(text[i + word.length]))) spans.push({ start: i, length: word.length });
    }
    return spans;
}

// A user-supplied regex source is refused when it is long or shaped to backtrack catastrophically (nested quantifiers, stacked wildcards).
export function unsafeRegex(source) {
    if (source.length > 200) return 'longer than 200 characters';
    if (/\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/.test(source)) return 'nested quantifier (catastrophic backtracking risk)';
    if (/(\.\*){3,}/.test(source)) return 'repeated wildcards';
    return null;
}

const MAX_SCAN_LINE = 5000;

// A query is plain text (case-insensitive) or /regex/flags; returns a function line -> [{ start, length }] or throws on a bad regex.
export function matcherFor(query) {
    const m = /^\/(.+)\/([a-z]*)$/.exec(query);
    if (m) {
        const bad = unsafeRegex(m[1]);
        if (bad) throw new Error(`regex refused: ${bad}`);
        const rx = new RegExp(m[1], m[2].includes('g') ? m[2] : m[2] + 'g');
        return line => Array.from(line.slice(0, MAX_SCAN_LINE).matchAll(rx), x => ({ start: x.index, length: x[0].length })).filter(s => s.length > 0);
    }
    const needle = query.toLowerCase();
    return line => {
        const found = []; const hay = line.toLowerCase();
        for (let i = hay.indexOf(needle); needle && i !== -1; i = hay.indexOf(needle, i + needle.length)) found.push({ start: i, length: needle.length });
        return found;
    };
}

const toLines = text => String(text).replace(/\r\n/g, '\n').split('\n');

// Shared by SnapshotProvider and LazyProvider: both hold `files: Map<path, { path, language?, lines }>` once a file's content is
// in hand, so search/references need only one definition each.
function searchIn(files, query) {
    const match = matcherFor(query);
    const groups = [];
    for (const f of files.values()) {
        const hits = [];
        f.lines.forEach((text, i) => { const spans = match(text); if (spans.length) hits.push({ line: i + 1, text, spans }); });
        if (hits.length) groups.push({ path: f.path, hits });
    }
    return groups;
}
function referencesIn(files, word) {
    const out = [];
    for (const f of files.values()) f.lines.forEach((text, i) => { if (wordSpans(text, word).length) out.push({ path: f.path, line: i + 1, text }); });
    return out;
}

export class SnapshotProvider {
    constructor(snapshot) {
        this.files = new Map((snapshot.files ?? []).map(f => [f.path, { ...f, lines: f.lines ?? toLines(f.content ?? '') }]));
        this.generated = snapshot.generated;
        const anySymbols = [...this.files.values()].some(f => f.symbols?.length);
        this.capabilities = { search: true, outline: anySymbols, references: true, live: false };
    }

    static async load(url, fetchFn = globalThis.fetch) {
        const res = await fetchFn(url);
        if (!res.ok) throw new Error(`snapshot ${url}: ${res.status}`);
        return new SnapshotProvider(await res.json());
    }

    async listFiles() { return [...this.files.values()].map(f => ({ path: f.path, lines: f.lines.length, language: f.language })); }

    async readFile(path) {
        const f = this.files.get(path);
        if (!f) throw new Error(`no such file: ${path}`);
        return { path: f.path, language: f.language, lines: f.lines };
    }

    async search(query) { return searchIn(this.files, query); }

    async outline(path) { return this.files.get(path)?.symbols ?? []; }

    async references(path, word) { return referencesIn(this.files, word); }
}

// A lean file list up front (path, language, line count -- no content), each file's real text fetched same-origin, lazily, only
// once it is opened, searched or referenced-in, and cached from then on (issue 196: the live site no longer ships a multi-megabyte
// snapshot to browse one file). STANDARDS.md, "Security (CSP)": no runtime request to another origin, so `raw` is always same-origin
// with the page (the Pages deploy's own copy of the source tree; build-pages.mjs's FULL folders). search/outline/references need
// every file's content, so the first call to any of them fetches whatever is not cached yet -- one file at a time, not Promise.all,
// so a large tree does not open hundreds of connections at once just because the user typed one search; a second search is free.
export class LazyProvider {
    constructor(files, raw, { fetch: fetchFn = globalThis.fetch.bind(globalThis) } = {}) {
        this.raw = String(raw).replace(/\/+$/, '');
        this.fetch = fetchFn;
        this.files = new Map(files.map(f => [f.path, { path: f.path, language: f.language, lineCount: f.lines, lines: null }]));
        this.capabilities = { search: true, outline: true, references: true, live: false };
    }

    // list: the URL of the lean file list (site/files/index.json). raw: the same-origin base the real files sit under (the page's
    // own core/ copy, resolved from the caller's own module URL; see site/files/page.js).
    static async connect(list, raw, options = {}) {
        const fetchFn = options.fetch ?? globalThis.fetch;
        const res = await fetchFn(list);
        if (!res.ok) throw new Error(`file list ${list}: ${res.status}`);
        const { files } = await res.json();
        return new LazyProvider(files ?? [], raw, options);
    }

    async listFiles() { return [...this.files.values()].map(f => ({ path: f.path, lines: f.lines?.length ?? f.lineCount, language: f.language })); }

    async #need(path) {
        const f = this.files.get(path);
        if (!f) throw new Error(`no such file: ${path}`);
        if (f.lines === null) {
            const res = await this.fetch(`${this.raw}/${path}`);
            if (!res.ok) throw new Error(`${path}: ${res.status}`);
            f.lines = toLines(await res.text());
        }
        return f;
    }

    async readFile(path) {
        const f = await this.#need(path);
        return { path: f.path, language: f.language, lines: f.lines };
    }

    async #needAll() { for (const f of this.files.values()) if (f.lines === null) await this.#need(f.path); }

    async search(query) { await this.#needAll(); return searchIn(this.files, query); }

    async outline(path) {
        const f = await this.#need(path);
        return symbolsOf(f.lines.join('\n'), f.language);
    }

    async references(path, word) { await this.#needAll(); return referencesIn(this.files, word); }
}

export class ApiProvider {
    constructor(base, { fetch: fetchFn = globalThis.fetch.bind(globalThis), capabilities } = {}) {
        this.base = String(base).replace(/\/+$/, '');
        this.fetch = fetchFn;
        this.capabilities = { ...NO_CAPABILITIES, ...capabilities };
    }

    static async connect(base, options = {}) {
        const p = new ApiProvider(base, options);
        try { p.capabilities = { ...NO_CAPABILITIES, ...(await p.#get('capabilities')) }; } catch (error) { log.debug('the server has no capabilities endpoint: list and read only', error); }
        return p;
    }

    async #get(path, query = {}) {
        const qs = new URLSearchParams(query).toString();
        const res = await this.fetch(`${this.base}/${path}${qs ? '?' + qs : ''}`);
        if (!res.ok) throw new Error(`${path}: ${res.status}`);
        return res.json();
    }

    listFiles() { return this.#get('files'); }

    async readFile(path) {
        const f = await this.#get('file', { path });
        return { path: f.path ?? path, language: f.language, lines: f.lines ?? toLines(f.content ?? '') };
    }

    search(q) { return this.#get('search', { q }); }
    outline(path) { return this.#get('outline', { path }); }
    references(path, word) { return this.#get('references', { path, word }); }
}

// Wraps another provider and adds live updates from a feed (SSE by default, polling when `interval` ms is given).
export class FeedProvider {
    constructor(inner, feedUrl, { EventSource: ES = globalThis.EventSource, fetch: fetchFn = globalThis.fetch.bind(globalThis), interval = 0 } = {}) {
        this.inner = inner;
        this.feedUrl = feedUrl;
        this.ES = ES;
        this.fetch = fetchFn;
        this.interval = interval;
        this.capabilities = { ...inner.capabilities, live: true };
        for (const m of ['listFiles', 'readFile', 'search', 'outline', 'references']) this[m] = (...args) => inner[m](...args);
    }

    subscribe(cb) {
        if (this.interval > 0) {
            let last = '';
            const timer = setInterval(async () => {
                try {
                    const text = JSON.stringify(await (await this.fetch(this.feedUrl)).json());
                    if (text !== last) { if (last) cb({ type: 'changed' }); last = text; }
                } catch (error) { log.debug('the change feed could not be read: trying again next tick', error); }
            }, this.interval);
            return () => clearInterval(timer);
        }
        const es = new this.ES(this.feedUrl);
        es.onmessage = e => { try { cb(JSON.parse(e.data)); } catch (error) { log.debug('a change event was not JSON: treating it as a change', error); cb({ type: 'changed' }); } };
        return () => es.close();
    }
}

// The methods a provider must have for what it claims. Returns a list of problems; empty means it honours the contract.
export function contractProblems(provider) {
    const problems = [];
    for (const m of ['listFiles', 'readFile']) if (typeof provider[m] !== 'function') problems.push(`missing ${m}()`);
    const caps = provider.capabilities ?? {};
    const needs = { search: 'search', outline: 'outline', references: 'references', live: 'subscribe' };
    for (const [cap, method] of Object.entries(needs)) if (caps[cap] && typeof provider[method] !== 'function') problems.push(`claims ${cap} but has no ${method}()`);
    return problems;
}

// source: "snapshot" | "api" | "lazy" | "feed"; src: the snapshot URL, the API base URL, the lean file-list URL (lazy; pair with
// options.raw), or the feed URL (feed wraps `base`, an API base URL, via options.base).
export async function createProvider({ source, src, ...options }) {
    switch (source) {
        case 'snapshot': return SnapshotProvider.load(src, options.fetch);
        case 'api': return ApiProvider.connect(src, options);
        case 'lazy': return LazyProvider.connect(src, options.raw, options);
        case 'feed': return new FeedProvider(await ApiProvider.connect(options.base ?? src, options), src, options);
        default: throw new Error(`unknown code-explorer source "${source}" (use snapshot, api, lazy or feed)`);
    }
}
