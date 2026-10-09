// App framework enforcement (#362, tracker #346 sections 2, 4 and 6): the site is a consumer, so it carries no framework code, imports only public entries
// and has no extra HTML pages; the framework files under js/app/ are found by folder, so a new file can never escape a check.
// Known violations of the site are a LEDGER of `file::rule`: a new one fails, and one that is fixed must be removed from the ledger (it only shrinks).
// Each failure prints a FIX line. The rules are pure functions over { path -> text }, so a test can prove each one catches a bad fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES } from '../tools/security.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');

function listFiles(dir, keep) {
    const out = [];
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) out.push(...listFiles(p, keep));
        else if (keep(p)) out.push(p);
    }
    return out;
}

// Framework code that belongs in core/js/app, not in a page of the site.
const SITE_RULES = [
    ['navigation-listener', /addEventListener\(\s*['"](hashchange|popstate)['"]/],
    ['history-push', /history\.pushState/],
    ['storage', /\b(localStorage|sessionStorage)\b/],
    ['theme-observer', text => /new MutationObserver/.test(text) && /data-theme/.test(text)],
    ['pages-array', /\b(const|let|var)\s+[A-Z_]*PAGES\s*=\s*\[/],
    ['mount-shell', /\bmountShell\b/],
    ['app-internals', /from\s+['"](?:[^'"]*\/)?js\/app\/[^'"]*['"]/],
];

const FIXES = {
    'navigation-listener': 'FIX: use mountApp / defineModule (js/app.js); a page does not listen for hashchange or popstate.',
    'history-push': 'FIX: navigate through ctx.navigate; a page does not touch history.',
    'storage': 'FIX: keep state in ctx.store or ctx.settings; a page does not use localStorage.',
    'theme-observer': 'FIX: read the theme from ctx.theme.',
    'pages-array': 'FIX: list modules in the app config, not in a PAGES array.',
    'mount-shell': 'FIX: mountApp owns the shell.',
    'app-internals': 'FIX: import from the public entry js/app.js, not js/app/**.',
    'extra-html-page': 'FIX: the site has one app entry (plus embed/preview hosts); make this a module of the app.',
};
const fixFor = v => FIXES[v.split('::')[1].split(':')[0]] ?? 'FIX: import a public entry (an API baseline export, js/plainkit.js, js/app.js or a modules/<name>/<name>.js entry).';

// The public core entries: the files the API baseline exports from, the runtime entries and each module's own entry file.
function publicEntries(baseline, moduleDirs) {
    const files = new Set(baseline.exports.map(e => e.split(':')[0]));
    for (const f of ['js/plainkit.js', 'js/app.js', 'elements/registry.js']) files.add(f);
    for (const m of moduleDirs) files.add(`modules/${m}/${m}.js`);
    return files;
}

// site: Map(path -> text) of the site's .js and .html files. Returns violation ids `path::rule`.
function siteViolations(site, { pub, htmlAllowed }) {
    const found = [];
    for (const [file, text] of site) {
        if (file.endsWith('.html')) {
            if (!htmlAllowed.some(re => re.test(file))) found.push(`${file}::extra-html-page`);
            continue;
        }
        const code = strip(text);
        for (const [id, rule] of SITE_RULES) if (typeof rule === 'function' ? rule(code) : rule.test(code)) found.push(`${file}::${id}`);
        for (const m of code.matchAll(/(?:from|import\()\s*['"](\.[^'"]+)['"]/g)) {
            const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1]));
            if (/^(js|modules|elements)\//.test(target) && !pub.has(target)) found.push(`${file}::non-public-import:${target}`);
        }
    }
    return [...new Set(found)].sort();
}

// The site as it is today. Each entry is a step of the migration still to land; remove an entry when its violation is gone.
const KNOWN = new Set([
    'site/devtools/index.html::extra-html-page', 'site/files/index.html::extra-html-page', 'site/gallery/index.html::extra-html-page', 'site/guides/index.html::extra-html-page',
    'site/layout-builder/index.html::extra-html-page', 'site/scorecard/index.html::extra-html-page', 'site/settings/index.html::extra-html-page',
    'site/spacing/index.html::extra-html-page', 'site/theme/index.html::extra-html-page',
    'site/devtools/page.js::mount-shell', 'site/files/page.js::mount-shell', 'site/gallery/standalone.js::mount-shell', 'site/guides/page.js::mount-shell',
    'site/layout-builder/layout-builder.js::mount-shell', 'site/scorecard/scorecard.js::mount-shell', 'site/settings/page.js::mount-shell', 'site/theme/theme.js::mount-shell',
    'site/shell.js::mount-shell', 'site/shell.js::pages-array', 'site/shell.js::theme-observer', 'site/theme/theme.js::theme-observer',
    'site/guides/page.js::navigation-listener', 'site/guides/page.js::history-push',
]);
// Internal files the site still reaches into (ledgered by pattern so the list needs no per-file entry); also only shrinks.
const KNOWN_IMPORTS = /::non-public-import:(modules\/code-explorer\/providers\.js)$/;

const readSite = () => new Map(listFiles('site', f => /\.(js|html)$/.test(f) && !/\.data\.js$/.test(f)).map(f => [f, fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n')]));
const realContext = () => ({
    pub: publicEntries(JSON.parse(fs.readFileSync(path.join(root, 'site/scorecard/api.baseline.json'), 'utf8')), fs.readdirSync(path.join(root, 'modules'))),
    htmlAllowed: [/^site\/gallery\/(embed|preview)\.html$/],
});

test('dogfood: the site adds no framework code, imports only public entries and has no extra HTML page beyond the ledger, and the ledger only shrinks', () => {
    const now = new Set(siteViolations(readSite(), realContext()));
    const fresh = [...now].filter(v => !KNOWN.has(v) && !KNOWN_IMPORTS.test(v));
    assert.deepEqual(fresh.map(v => `${v}\n${fixFor(v)}`), [], 'the site has framework code, a non-public import or an extra HTML page that is not in the known-violations ledger');
    const stale = [...KNOWN].filter(v => !now.has(v));
    assert.deepEqual(stale, [], 'FIX: these violations are gone: delete them from KNOWN in core/tests/app-dogfood.test.mjs (the ledger only shrinks)');
    const staleImports = ['modules/code-explorer/providers.js'].filter(f => ![...now].some(v => v.endsWith(`::non-public-import:${f}`)));
    assert.deepEqual(staleImports, [], 'FIX: the site no longer imports these: remove them from KNOWN_IMPORTS in core/tests/app-dogfood.test.mjs');
});

test('dogfood: every rule catches a deliberately bad fixture, and a clean consumer passes', () => {
    const ctx = { pub: new Set(['js/app.js', 'js/plainkit.js']), htmlAllowed: [/^site\/gallery\/embed\.html$/] };
    const bad = new Map([
        ['site/a.js', "window.addEventListener('hashchange', route);\nhistory.pushState(null, '', '#x');\nlocalStorage.getItem('k');\nconst PAGES = [];\nmountShell({});\nnew MutationObserver(f).observe(document.documentElement, { attributeFilter: ['data-theme'] });\nimport { x } from '../js/app/host.js';\nimport { y } from '../js/theme.js';"],
        ['site/extra.html', '<!doctype html>'],
    ]);
    const got = siteViolations(bad, ctx);
    for (const id of [...SITE_RULES.map(r => r[0]), 'extra-html-page', 'non-public-import']) assert.ok(got.some(v => v.includes(`::${id}`)), `no violation for ${id}: ${got.join(', ')}`);
    const clean = new Map([['site/ok.js', "import { mountApp } from '../js/app.js';\n// localStorage in a comment is fine\nmountApp({});"], ['site/gallery/embed.html', '<!doctype html>']]);
    assert.deepEqual(siteViolations(clean, ctx), []);
});

test('the framework is found by folder: every file under js/app/ is either in the entry import graph or a page-type chunk under pages/', () => {
    const graph = new Set();
    const walk = f => {
        if (graph.has(f)) return;
        graph.add(f);
        for (const m of fs.readFileSync(path.join(root, f), 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"\n]*?from\s+'(\.[^']+)'/g)) walk(path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1])));
    };
    walk('js/app.js');
    for (const f of graph) assert.ok(/^js\/[^/]+\.js$|^js\/app\/[^/]+\.js$/.test(f), `${f} is in the entry graph but is neither a js/ file nor a js/app/ file. FIX: keep the entry's static imports to the framework; load other code lazily.`);
    for (const f of listFiles('js/app', p => p.endsWith('.js'))) {
        const inPages = f.startsWith('js/app/pages/');
        assert.ok(inPages !== graph.has(f), `${f} is ${inPages ? 'a page-type chunk that the entry imports statically' : 'neither in the entry graph nor under js/app/pages/'}. FIX: a lazy chunk goes in js/app/pages/ (budgeted as a page type); anything else the entry imports.`);
    }
});

test('the framework sources (found by folder) have no markup sink, no polling, no bare console, no direct storage, no stray import()', () => {
    const files = ['js/app.js', ...listFiles('js/app', p => p.endsWith('.js'))];
    assert.ok(files.length >= 20);
    const allow = JSON.parse(fs.readFileSync(path.join(root, 'tools/security.allow.json'), 'utf8'));
    for (const f of files) {
        const src = strip(fs.readFileSync(path.join(root, f), 'utf8'));
        assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/.test(src), `${f} has a markup sink or eval. FIX: build nodes with DOM APIs and textContent; js/app/** has zero sinks.`);
        assert.ok(!/setInterval|requestAnimationFrame/.test(src), `${f} polls. FIX: no repeating timers; use ctx.after for a one-off and a subscription for changes.`);
        assert.ok(!/\bconsole\./.test(src), `${f} uses console. FIX: use createLogger(scope) from js/log.js.`);
        assert.ok(!/localStorage|sessionStorage/.test(src), `${f} touches storage directly. FIX: go through js/store.js.`);
        assert.ok(!/\bimport\(/.test(src.replace('import(`./pages/${id}.js`)', '')), `${f} calls import() with something other than the fixed ./pages/<id>.js. FIX: modules load only through the app config's static loaders.`);
        assert.ok(!allow.htmlSinks[f], `${f} has an html sink entry in security.allow.json. FIX: remove the sink; the framework has none.`);
    }
});

test('security rules for the framework (tools/security.mjs) fire on a bad fixture and stay quiet on a clean one', () => {
    const hit = (id, text) => RULES.find(r => r.id === id).pattern.test(text);
    assert.ok(hit('app-no-polling', 'const t = setInterval(tick, 100);'));
    assert.ok(hit('app-no-polling', 'requestAnimationFrame(loop)'));
    assert.ok(!hit('app-no-polling', 'const t = setTimeout(tick, 100);'));
    assert.ok(hit('app-no-direct-storage', 'localStorage.setItem(k, v)'));
    assert.ok(hit('app-no-direct-storage', 'sessionStorage.getItem(k)'));
    assert.ok(hit('app-import-only-allowed', 'const m = await import(url);'));
    assert.ok(hit('app-import-only-allowed', 'load: () => import(`./modules/${id}.js`)'));
    assert.ok(!hit('app-import-only-allowed', '(host, config, ctx) => import(`./pages/${id}.js`).then(m => m.default(host, config, ctx))'));
    assert.ok(!hit('app-import-only-allowed', "// load: () => import('./modules/orders.js')"));
    assert.ok(hit('app-no-console', 'console.log(x)'));
});
