// dist/gallery is the gallery as other projects embed it: self-contained, every path resolved inside dist/, no inline script or style.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from '../tools/build.mjs';
import { relocate } from '../tools/gallery-dist.mjs';

const { out } = build({ write: false });
const gallery = [...out.keys()].filter(f => f.startsWith('dist/gallery/'));
const resolve = (from, spec) => path.posix.normalize(path.posix.join(path.posix.dirname(from), spec.split(/[?#]/)[0]));

test('relocate drops one level from specifiers that climb out of the gallery folder, and nothing else', () => {
    assert.equal(relocate("import a from '../../js/x.js';"), "import a from '../js/x.js';");
    assert.equal(relocate('import "../../js/x.js"'), 'import "../js/x.js"');
    assert.equal(relocate("import a from '../sample-tree.js';"), "import a from '../sample-tree.js';");
    assert.equal(relocate("import a from './frame.js';"), "import a from './frame.js';");
    assert.equal(relocate("import '../../../js/a.js'; import b from '../c.js';", 1), "import '../../js/a.js'; import b from '../c.js';");
});

test('dist/gallery holds the modules, data, styles and templates the embed page needs', () => {
    for (const f of ['embed.html', 'embed.js', 'gallery.js', 'gallery.data.js', 'paths.js', 'frame.js', 'frame-boot.js', 'tokens.css', 'site.css', 'gallery.css', 'templates/crud/crud.html', 'templates/chrome.js', 'preview.html', 'preview.js']) assert.ok(out.has(`dist/gallery/${f}`), f);
    assert.ok(out.has('dist/js/gallery-options.js'));
    for (const f of ['standalone.js', 'index.html']) assert.ok(!out.has(`dist/gallery/${f}`), `${f} is the SDK site's own host page`);
});

test('every relative import, stylesheet and script in dist/gallery resolves to a file in dist', () => {
    const missing = [];
    for (const file of gallery) {
        const text = out.get(file).split(/\r?\n/).filter(l => !l.includes('&lt;')).join('\n');
        const specs = /\.js$/.test(file)
            ? [...text.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"$`]+)['"]/g)].map(m => m[1])
            : /\.html$/.test(file) ? [...text.matchAll(/(?:href|src)="(\.{1,2}\/[^"]+)"/g)].map(m => m[1]).filter(s => !s.startsWith('../page/')) : [];
        for (const spec of specs) {
            const target = resolve(file, spec);
            if (!target.startsWith('dist/') || !out.has(target)) missing.push(`${file} -> ${spec}`);
        }
    }
    assert.deepEqual(missing, []);
});

test('the paths module points every stylesheet, the sprite and the templates at files that ship', async () => {
    const source = out.get('dist/gallery/paths.js').replace(/export const ROOT.*\r?\n/, '');
    const { PAGE_CSS, TOKENS_CSS, UTILITIES_CSS, SPACING_CSS, ICONS, TEMPLATES_DIR, HAS_SITE } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
    for (const p of [...PAGE_CSS, TOKENS_CSS, UTILITIES_CSS, SPACING_CSS, ICONS]) assert.ok(out.has(resolve('dist/gallery/x', p)), p);
    assert.ok(out.has(`dist/gallery/${TEMPLATES_DIR}crud/crud.html`));
    assert.equal(HAS_SITE, false);
});

test('the embed page and the templates carry no inline script, style or handler', () => {
    for (const f of gallery.filter(g => g.endsWith('.html'))) {
        const t = out.get(f);
        assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>/i.test(t), `${f} has an inline script`);
        assert.ok(!/<style[\s>]|\sstyle\s*=|\son[a-z]+\s*=/i.test(t), `${f} has an inline style or handler`);
    }
    // The chrome is pk-* elements: the embed page does not load the class-based components; the sample frames do (paths.js PAGE_CSS).
    assert.doesNotMatch(out.get('dist/gallery/embed.html'), /plainkit-compat\.css/, 'the gallery chrome needs no class-based component');
    assert.match(out.get('dist/gallery/paths.js'), /PAGE_CSS = \[[^\]]*plainkit-compat\.css/, 'sample frames need the class-based components');
});

test('the preview host ships in dist/gallery with its paths relocated, and the templates send ?width=phone to it', () => {
    const html = out.get('dist/gallery/preview.html');
    assert.match(html, /href="\.\.\/plainkit\.css"/);
    assert.match(html, /plainkit-compat\.css/, 'patterns use the class-based components');
    assert.match(html, /<script type="module" src="preview\.js">/);
    const js = out.get('dist/gallery/preview.js');
    assert.match(js, /from '\.\.\/js\/plainkit\.js'/);
    assert.match(js, /import\('\.\/gallery\.data\.js'\)/);
    assert.ok(!/site\/gallery|\.\.\/\.\.\//.test(js.replace(/\/\/ .*$/gm, '')), 'no source paths');
    assert.match(out.get('dist/gallery/templates/chrome.js'), /new URL\("\.\.\/preview\.html"/);
    assert.match(out.get('dist/gallery/paths.js'), /PREVIEW = 'preview\.html'/);
});

test('nothing in dist/gallery names the source tree', () => {
    for (const f of gallery.filter(g => /\.(js|html)$/.test(g) && !/gallery(\.data)?\.js$/.test(g))) assert.ok(!/site\/gallery|samples\/templates|\/tokens\/tokens\.css/.test(out.get(f).replace(/\/\/ .*$/gm, '')), f);
    assert.ok(!out.get('dist/js/gallery-options.js').includes('../site/gallery/'), 'the dist copy of the options module points at dist/gallery');
});

test('the generated paths module exports exactly what the source one does', async () => {
    const names = text => [...text.matchAll(/^export (?:async function|const) (\w+)/gm)].map(m => m[1]).sort();
    const source = (await import('node:fs')).readFileSync(new URL('../site/gallery/paths.js', import.meta.url), 'utf8');
    assert.deepEqual(names(out.get('dist/gallery/paths.js')), names(source));
});
