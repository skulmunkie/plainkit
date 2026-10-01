// Internal dev tool (issue #577): "where is pk-X used, and how many times?" across the repo's own source. Standalone on purpose -
// it enumerates usage, the #518 conformance-audit CLI (core/tools/audit/**) detects violations against a different data model, and
// they are not coupled. Reuses the strict-module tag tokenizer (core/tools/strict/scanners/html.mjs, js.mjs, issue #605) instead of
// re-parsing HTML/JS by hand: scanHtml walks markup for `<pk-name>` tags and `<PkName>` Razor/JSX components, scanJs finds JS
// identifiers/template literals and re-feeds a template literal's text through scanHtml so a `pk-*` tag built with a JS template
// string is still counted.
//
//   node core/tools/usage-index.mjs [--json] [--out <file>]
//
// Walks the repo's own source (core/elements/**, core/modules/**, core/site/**, core/samples/**, scripts/skills/**, blazor/mappings/**)
// and reports, per pk-* element: a reference count (the number of distinct non-test files that mention it) and those files, grouped
// by category (elements composing it, site modules, gallery examples, samples, docs, its Blazor mapping). Test files (`*.test.mjs`)
// are not scanned - the issue's flag is about "non-test, non-self" references. A file inside an element's own folder mentioning its
// own tag (its template, its gallery examples) is "self" and does not count as a reference either: the question this tool answers is
// whether OTHER content uses the element, not whether the element uses itself.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanHtml } from './strict/scanners/html.mjs';
import { scanJs } from './strict/scanners/js.mjs';
import { elementFolders } from './usage.mjs';
import { TIER_FOLDERS } from './element-folders.mjs';

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(coreRoot, '..');

export const CATEGORIES = ['elements', 'site', 'gallery', 'samples', 'docs', 'blazor'];

// "AccordionItem" -> "accordion-item".
export function kebab(name) {
    return name.replace(/(?!^)[A-Z]/g, m => `-${m}`).toLowerCase();
}

// The `pk-*` element names a scanned node refers to: a lower-case `<pk-name>` tag, or an upper-case `<PkName>` Razor/JSX component.
export function nodeToElement(node, elementNames) {
    if (node.kind === 'tag' && node.name.startsWith('pk-')) {
        const name = node.name.slice(3);
        return elementNames.has(name) ? name : null;
    }
    if (node.kind === 'component' && /^Pk[A-Z]/.test(node.name)) {
        const name = kebab(node.name.slice(2));
        return elementNames.has(name) ? name : null;
    }
    return null;
}

// Every element referenced in a chunk of markup (HTML, Razor or Markdown text), de-duplicated, sorted.
export function elementsInMarkup(text, elementNames) {
    const { nodes } = scanHtml(text);
    return [...new Set(nodes.map(n => nodeToElement(n, elementNames)).filter(Boolean))].sort();
}

// Every element referenced in a JS/TS/JSX file: JSX tags found by the JS scanner, plus markup found inside its template literals
// (a `pk-*` tag built as `` `<pk-tabs>...` `` is not JSX, so it is not in `jsx` - re-scan the literal's text as markup instead).
export function elementsInScript(text, elementNames) {
    const { tokens, jsx } = scanJs(text);
    const found = new Set(jsx.map(n => nodeToElement(n, elementNames)).filter(Boolean));
    for (const t of tokens) {
        if (t.kind !== 'template') continue;
        const inner = t.value.slice(1, -1); // strip the backticks
        for (const name of elementsInMarkup(inner, elementNames)) found.add(name);
    }
    return [...found].sort();
}

const MARKUP_EXT = new Set(['.html', '.razor', '.md']);
const SCRIPT_EXT = new Set(['.js', '.mjs', '.jsx', '.ts', '.tsx']);

export function elementsInFile(text, ext, elementNames) {
    if (MARKUP_EXT.has(ext)) return elementsInMarkup(text, elementNames);
    if (SCRIPT_EXT.has(ext)) return elementsInScript(text, elementNames);
    return [];
}

// An element's own `*.meta.json` gallery examples (issue #577's "gallery examples"): the markup lives in `examples[].html`, not as a
// file the HTML scanner would otherwise see, so it is pulled out and scanned as markup on its own.
export function elementsInMeta(text, elementNames) {
    let meta;
    try { meta = JSON.parse(text); } catch { return []; }
    const html = (meta.examples ?? []).map(e => e.html ?? '').join('\n');
    return elementsInMarkup(html, elementNames);
}

// Where a repo-relative path (forward slashes) belongs: its category, and, for a file inside an element's own folder or its own
// Blazor mapping, the element it "owns" (self-references there are excluded from the count). null means "not scanned".
export function classify(relPath) {
    if (/\.test\.m?js$/.test(relPath)) return null; // not scanned: "non-test" per the issue

    let m;
    if ((m = /^core\/elements\/([a-z][a-z0-9-]*)\/\1\.meta\.json$/.exec(relPath))) return { category: 'gallery', owner: m[1] };
    if ((m = /^core\/(?:elements|components|pages|shells)\/([a-z][a-z0-9-]*)\/\1\.(html|js)$/.exec(relPath))) return { category: 'elements', owner: m[1] };
    if (/^core\/elements\//.test(relPath)) return null; // generated (*.element.js) or anything else in the folder

    if (/^core\/modules\//.test(relPath) && /\.(html|js)$/.test(relPath)) return { category: 'site', owner: null };

    if (/^core\/site\/gallery\//.test(relPath)) {
        if (relPath.endsWith('.data.js')) return null; // generated
        if (/\.(html|js)$/.test(relPath)) return { category: 'gallery', owner: null };
        return null;
    }
    if (/^core\/site\/guides\/content\/.*\.md$/.test(relPath)) return { category: 'docs', owner: null };
    if (/^core\/site\//.test(relPath)) {
        if (relPath.endsWith('.data.js') || /\/(snapshot|index)\.json$/.test(relPath) || relPath.endsWith('api.current.json')) return null; // generated
        if (/\.(html|js)$/.test(relPath)) return { category: 'site', owner: null };
        return null;
    }

    if (/^core\/samples\//.test(relPath) && /\.(html|js)$/.test(relPath)) return { category: 'samples', owner: null };

    if (/^scripts\/skills\/.*\.md$/.test(relPath)) return { category: 'docs', owner: null };

    if ((m = /^blazor\/mappings\/([a-z][a-z0-9-]*)\.json$/.exec(relPath))) return { category: 'blazor', owner: m[1] };

    return null;
}

function walk(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        if (['node_modules', 'dist', 'obj', 'bin', '.git'].includes(e.name)) return [];
        const full = path.join(dir, e.name);
        return e.isDirectory() ? walk(full) : [full];
    });
}

// The blazor mapping is a 1:1 file per element (accordion-item.json declares PkAccordionItem): it never references a different
// element, so it is recorded as that element's own "blazor" file rather than scanned for tags.
function fileEntries(root, elementNames) {
    const dirs = [...TIER_FOLDERS.map(f => `core/${f}`), 'core/modules', 'core/site', 'core/samples', 'scripts/skills', 'blazor/mappings'];
    const files = dirs.flatMap(d => walk(path.join(root, d)));
    const entries = [];
    for (const file of files) {
        const relPath = path.relative(root, file).split(path.sep).join('/');
        const info = classify(relPath);
        if (!info) continue;
        if (info.category === 'blazor') { entries.push({ relPath, category: 'blazor', refs: [info.owner], owner: info.owner }); continue; }
        const ext = path.extname(relPath);
        const text = fs.readFileSync(file, 'utf8');
        const found = relPath.endsWith('.meta.json') ? elementsInMeta(text, elementNames) : elementsInFile(text, ext, elementNames);
        const refs = found.filter(name => name !== info.owner);
        if (refs.length) entries.push({ relPath, category: info.category, refs, owner: info.owner });
    }
    return entries;
}

// { [element]: { total, files: { elements: [...], site: [...], ... } } }, `total` the number of distinct non-test, non-self files
// referencing it across every category (including its own Blazor mapping file, if any).
export function buildIndex(entries, elementNames) {
    const index = {};
    for (const name of elementNames) index[name] = { total: 0, files: Object.fromEntries(CATEGORIES.map(c => [c, []])) };
    for (const entry of entries) for (const name of entry.refs) {
        if (!index[name]) continue; // a stale reference to a removed element: ignore rather than crash
        index[name].files[entry.category].push(entry.relPath);
    }
    for (const name of Object.keys(index)) {
        for (const c of CATEGORIES) index[name].files[c].sort();
        index[name].total = CATEGORIES.reduce((n, c) => n + index[name].files[c].length, 0);
    }
    return index;
}

// Elements with zero references anywhere (a candidate to remove or deprecate), sorted by name.
export function zeroReferenced(index) {
    return Object.keys(index).filter(name => index[name].total === 0).sort();
}

// The elements most composed by other elements' own templates/scripts (the composition backbone: change these with extra care),
// most-used first, ties broken by name.
export function mostComposedBy(index, limit = 10) {
    return Object.keys(index)
        .map(name => ({ name, count: index[name].files.elements.length }))
        .filter(x => x.count > 0)
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, limit);
}

export function usageIndex(root = repoRoot) {
    const elementNames = elementFolders(path.join(root, 'core'));
    const entries = fileEntries(root, elementNames);
    const index = buildIndex(entries, elementNames);
    return { index, zeroReferenced: zeroReferenced(index), mostComposedBy: mostComposedBy(index) };
}

function formatTable({ index, zeroReferenced, mostComposedBy }) {
    const L = [];
    const names = Object.keys(index).sort((a, b) => index[a].total - index[b].total || a.localeCompare(b));
    L.push(`${names.length} pk-* elements; ${names.reduce((n, x) => n + index[x].total, 0)} references total`);
    L.push('');
    for (const name of names) {
        const e = index[name];
        const byCat = CATEGORIES.filter(c => e.files[c].length).map(c => `${c}=${e.files[c].length}`).join(' ');
        L.push(`  ${String(e.total).padStart(3)}  pk-${name}${byCat ? `  (${byCat})` : ''}`);
    }
    L.push('');
    L.push(`ZERO REFERENCES (${zeroReferenced.length}), candidates for removal or deprecation:`);
    for (const name of zeroReferenced) L.push(`  pk-${name}`);
    L.push('');
    L.push(`COMPOSITION BACKBONE (most composed by other elements):`);
    for (const x of mostComposedBy) L.push(`  ${String(x.count).padStart(2)}  pk-${x.name}`);
    return L.join('\n');
}

async function main() {
    const args = process.argv.slice(2);
    const asJson = args.includes('--json');
    const outAt = args.indexOf('--out');
    const result = usageIndex();
    if (outAt !== -1) {
        const file = args[outAt + 1];
        if (!file) { console.error('--out needs a file path'); return 2; }
        fs.writeFileSync(path.resolve(file), JSON.stringify(result, null, 1) + '\n');
        console.log(`wrote ${file}`);
    }
    console.log(asJson ? JSON.stringify(result, null, 1) : formatTable(result));
    return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main());
