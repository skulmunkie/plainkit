// The Guides (core/site/guides/content/*.md) are documentation with code in it, so they are verified like the agent skills are: every sample is real (real pk-*
// tags, props, slots and values; real Pk* components, parameters and enums; real exports of dist; real tokens), every link resolves, and where a guide and the
// package README both describe the Blazor setup they must agree on the essentials. The converter and the loader are tested in core/tests/guides.test.mjs.
import '../../core/tests/needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { root } from '../build-skills.mjs';
import { src, byTag, checkHtml, checkRazor, checkCode, checkJs } from './sample-checkers.mjs';

const read = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const CONTENT = 'core/site/guides/content';
const guides = fs.readdirSync(path.join(root, CONTENT)).filter(f => f.endsWith('.md')).sort().map(f => ({ id: f.slice(0, -3), file: `${CONTENT}/${f}`, text: read(`${CONTENT}/${f}`) }));
const fencesOf = text => [...text.matchAll(/^```(\w*)\n([\s\S]*?)^```/gm)].map(m => ({ lang: m[1], text: m[2].replace(/\n$/, '') }));
const guide = id => guides.find(g => g.id === id);
const readme = read('blazor/src/PlainKit.Blazor/README.md');

test('every code fence is either checked below or plain text (bash, markdown, text), so no sample can hide unchecked', () => {
    const CHECKED = new Set(['html', 'js', 'css', 'razor', 'csharp']), PLAIN = new Set(['bash', 'markdown', 'text']);
    let checked = 0;
    for (const g of guides) for (const { lang, text } of fencesOf(g.text)) {
        assert.ok(CHECKED.has(lang) || PLAIN.has(lang), `${g.file}: a fence tagged "${lang}" is not verified: use one of ${[...CHECKED, ...PLAIN].join(', ')}\n${text.slice(0, 80)}`);
        if (CHECKED.has(lang)) checked++;
    }
    assert.ok(checked >= 20, `only ${checked} verified samples`);
});

test('every SDK html sample is real: balanced, real pk-* tags, props, slots and values', () => {
    for (const g of guides) for (const { lang, text } of fencesOf(g.text)) if (lang === 'html') assert.deepEqual(checkHtml(text), [], `${g.file}:\n${text.slice(0, 200)}`);
});

test('every JavaScript sample parses and imports only real exports of dist, with real mount and logging options', () => {
    let n = 0;
    for (const g of guides) for (const { lang, text } of fencesOf(g.text)) if (lang === 'js') { n++; assert.deepEqual(checkJs(text), [], `${g.file}:\n${text.slice(0, 200)}`); }
    assert.ok(n >= 8);
});

test('every CSS sample uses only real tokens or element custom properties', () => {
    const known = new Set([...src.breakpoints.map(b => `--pk-bp-${b.name}`), ...Object.keys(src.tokens.dark), ...Object.keys(src.tokens.light), ...Object.keys(src.tokens.root), ...src.api.flatMap(e => e.cssProperties.map(c => c.name))]);
    let n = 0;
    for (const g of guides) for (const { lang, text } of fencesOf(g.text)) if (lang === 'css') { n++; for (const m of text.matchAll(/(--[a-z0-9-]+)\s*:/g)) assert.ok(known.has(m[1]), `${g.file}: ${m[1]} is not a token`); for (const m of text.matchAll(/var\((--[a-z0-9-]+)/g)) assert.ok(known.has(m[1]), `${g.file}: var(${m[1]}) is not a token`); }
    assert.ok(n >= 2);
});

test('every token named in a guide\'s prose exists', () => {
    const known = new Set([...src.breakpoints.map(b => `--pk-bp-${b.name}`), ...Object.keys(src.tokens.dark), ...Object.keys(src.tokens.light), ...Object.keys(src.tokens.root), ...src.api.flatMap(e => e.cssProperties.map(c => c.name))]);
    for (const g of guides) for (const m of g.text.replace(/```[\s\S]*?```/g, '').matchAll(/`(--[a-z0-9-]+)`/g)) assert.ok(known.has(m[1]), `${g.file}: ${m[1]} is not a token`);
});

test('every Razor and C# sample uses only real Pk* components, parameters, enums, options and methods', () => {
    let razor = 0, cs = 0;
    for (const g of guides) for (const { lang, text } of fencesOf(g.text)) {
        if (lang === 'razor') { razor++; assert.deepEqual(checkRazor(text), [], `${g.file}:\n${text.slice(0, 200)}`); }
        if (lang === 'razor' || lang === 'csharp') { if (lang === 'csharp') cs++; assert.deepEqual(checkCode(text), [], `${g.file}:\n${text.slice(0, 200)}`); }
    }
    assert.ok(razor >= 4 && cs >= 2);
});

test('the checkers still catch a wrong sample (so a pass above means something)', () => {
    assert.ok(checkHtml('<pk-card colour="red"></pk-card>').length > 0);
    assert.ok(checkRazor('<PkSwitch @bind-Checked="x" Nope="1" />').some(p => /no parameter "Nope"/.test(p)));
    assert.ok(checkJs("import { nope } from './plainkit/js/theme.js';").length > 0);
});

test('every link in a guide resolves: another guide, a heading, or a file that exists relative to the Guides page', () => {
    const page = path.join(root, 'core', 'site', 'guides');
    let links = 0;
    for (const g of guides) for (const m of g.text.replace(/```[\s\S]*?```/g, '').matchAll(/\]\(([^)\s]+)\)/g)) {
        const href = m[1];
        if (/^(https?:|mailto:)/.test(href)) continue;
        links++;
        if (/^[\w-]+\.md(#|$)/.test(href)) { assert.ok(guide(href.split('#')[0].slice(0, -3)), `${g.file}: ${href} is not a guide`); continue; }
        assert.ok(fs.existsSync(path.join(page, href.split('#')[0])), `${g.file}: ${href} does not exist next to core/site/guides/index.html`);
    }
    assert.ok(links >= 10);
});

test('no guide hard-codes a release version (it would be wrong one release later)', () => {
    for (const g of guides) assert.deepEqual([...g.text.matchAll(/\b\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\b/g)].map(m => m[0]), [], `${g.file}: use <version> or "latest"`);
});

test('the Blazor guide and the package README agree on the essentials (package, registration, PkStyles first in the head, render mode, WebAssembly)', () => {
    const g = guide('getting-started-blazor').text;
    const essentials = [
        ['the package name', /PlainKit\.Blazor/],
        ['the target framework', /\.NET 10/],
        ['the namespace import', /@using PlainKit\.Blazor/],
        ['the registration call', /builder\.Services\.AddPlainKit\(/],
        ['the optional dev tools call', /\.AddPlainKitDevTools\(\)/],
        ['PkStyles goes in App.razor', /<PkStyles \/>[\s\S]*App\.razor|App\.razor[\s\S]*<PkStyles \/>/],
        ['the MainLayout.razor caveat: it lands in the body, after the head', /MainLayout\.razor[\s\S]{0,200}body/],
        ['the render mode', /@rendermode InteractiveServer/],
        ['a global render mode on Routes', /<Routes @rendermode="InteractiveServer" \/>/],
        ['the WebAssembly stylesheet link', /_content\/PlainKit\.Blazor\/plainkit\/plainkit\.css/],
    ];
    for (const [what, re] of essentials) { assert.match(readme, re, `the package README no longer says ${what}`); assert.match(g, re, `the Blazor guide does not say ${what}`); }
    // The placement rule itself: in each App.razor head sample PkStyles comes before the app's own stylesheet and before the HeadOutlet.
    for (const [name, text] of [['the package README', readme], ['the Blazor guide', g]]) {
        const head = fencesOf(text).find(f => f.lang === 'razor' && f.text.includes('<head>'));
        assert.ok(head, `${name} has an App.razor head sample`);
        const at = s => head.text.indexOf(s);
        assert.ok(at('<PkStyles') > 0 && at('<PkStyles') < at('app.css') && at('app.css') < at('<HeadOutlet'), `${name}: <PkStyles /> must come first in the head, above the app's stylesheet and <HeadOutlet />`);
    }
});

test('the SDK guide and PUBLISHING.md agree on how to get the files', () => {
    const g = guide('getting-started').text, publishing = read('PUBLISHING.md');
    for (const [what, re] of [['the Pages stylesheet link', /https:\/\/skulmunkie\.github\.io\/plainkit\/dist\/plainkit\.min\.css/], ['the release zip', /plainkit-dist-<version>\.zip/], ['the NuGet package', /dotnet add package PlainKit\.Blazor/], ['npm', /npm install plainkit/]]) {
        assert.match(publishing + read('README.md'), re, `PUBLISHING.md and the README no longer say ${what}`);
        assert.match(g, re, `the SDK guide does not say ${what}`);
    }
    assert.doesNotMatch(g, /jsdelivr/i, 'there is no CDN link by tag');
});

test('the SDK guide\'s first page is the wiring the loader needs: initPlainkit is called from a script file, never inline', () => {
    const g = guide('getting-started').text;
    for (const { lang, text } of fencesOf(g)) if (lang === 'html') assert.doesNotMatch(text.replace(/<script[^>]*\bsrc=[^>]*><\/script>/g, ''), /<script/, 'an inline script is blocked by a strict CSP');
    assert.ok(fencesOf(g).some(f => f.lang === 'js' && /initPlainkit\(\)/.test(f.text)));
});

// "Choosing what to build with" names elements, components, templates, layouts and patterns. A name that does not exist is a wrong instruction to an agent,
// so every one is checked against the catalogue (the same data the skills are generated from).
test('every element, component, template, layout and pattern the choosing guide names exists', () => {
    const g = guide('choosing-what-to-build-with').text;
    const prose = g.replace(/```[\s\S]*?```/g, '');
    const decls = new Set();
    const walk = dir => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { if (!['bin', 'obj', 'wwwroot'].includes(e.name)) walk(p); continue; }
            if (!/\.(cs|razor)$/.test(e.name)) continue;
            if (e.name.endsWith('.razor')) decls.add(e.name.slice(0, -6));
            for (const m of read(path.relative(root, p)).matchAll(/\b(?:class|record|enum|interface|struct)\s+(\w+)/g)) decls.add(m[1]);
        }
    };
    walk(path.join(root, 'blazor', 'src', 'PlainKit.Blazor'));
    let checked = 0;
    for (const m of prose.matchAll(/`([^`\n]+)`/g)) {
        const name = m[1];
        if (/^pk-[a-z][a-z-]*$/.test(name)) { checked++; assert.ok(byTag.has(name), `the guide names ${name}, which is not an element`); }
        else if (/^Pk[A-Z]\w*$/.test(name)) { checked++; assert.ok(decls.has(name), `the guide names ${name}, which is not a component or type of PlainKit.Blazor`); }
    }
    for (const [what, kind] of [['Template', 'templates'], ['Layout', 'layouts'], ['Pattern', 'patterns']]) {
        const known = new Set(src.samples[kind].map(s => s.id));
        for (const m of prose.matchAll(new RegExp(`\\b${what}\\s+\`([a-z-]+)\``, 'gi'))) { checked++; assert.ok(known.has(m[1]), `the guide names ${what.toLowerCase()} ${m[1]}, which does not exist (${[...known].join(', ')})`); }
    }
    assert.ok(checked >= 60, `only ${checked} names checked`);
    assert.ok(decls.has('PageBase') && decls.has('PkFieldSpec') && decls.has('PkRecordEditor'), 'the walk finds the Blazor types');
});

test('the choosing guide points to every template, layout and pattern that exists, and its use-case table has a Blazor column', () => {
    const g = guide('choosing-what-to-build-with').text;
    for (const [what, kind] of [['Template', 'templates'], ['Layout', 'layouts'], ['Pattern', 'patterns']]) {
        for (const s of src.samples[kind]) assert.match(g, new RegExp(`${what}\\s+\`${s.id}\``, 'i'), `the guide never points to the ${what.toLowerCase()} ${s.id}`);
    }
    assert.match(g, /\| Page type or job \| Start from \| In Blazor \|/);
});
