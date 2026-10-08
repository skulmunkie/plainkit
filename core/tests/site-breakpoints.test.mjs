// Site and module stylesheets name their breakpoints (@media (--phone), #682 S9) and every place that serves or ships one resolves the names with the same
// transform element CSS gets. This pins the result to the literal media queries these files carried before the names (so no width changes behaviour), and
// checks the dev server and the two dist units do resolve them.
import './needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { resolveSiteCss } from '../tools/breakpoints.mjs';
import { modulesDist } from '../tools/modules-dist.mjs';
import { galleryDist } from '../tools/gallery-dist.mjs';

const core = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(f, 'utf8');
const queries = css => [...css.matchAll(/@media\s*([^{]*)\{/g)].map(m => m[1].trim());

// The media conditions of each file before the names, in file order.
const BEFORE = {
    'modules/code-explorer/code-explorer.css': ['(max-width: 640px)'],
    'modules/layout-builder/layout-builder.css': ['(max-width: 640px)'],
    'modules/theme-editor/theme-editor.css': ['(max-width: 640px)'],
    'site/gallery/gallery.css': ['(max-width: 1024px)', '(max-width: 1280px)', '(max-width: 1024px)', '(max-width: 1024px)', '(max-width: 640px)'],
    'site/guides/guides.css': ['(max-width: 1280px)', '(max-width: 1024px)', '(max-width: 640px)'],
    'site/layout-builder/layout-builder.css': ['(max-width: 640px)'],
    'site/site.css': ['(max-width: 1024px)', '(max-width: 640px)'],
};

test('every site and module stylesheet resolves to exactly the media queries it carried before the breakpoint names', () => {
    for (const [file, before] of Object.entries(BEFORE)) {
        const source = read(path.join(core, file));
        assert.ok(!/\(max-width:\s*\d+px\)/.test(source), `${file} still has a literal breakpoint: name it (--phone, --tablet, --wide)`);
        assert.deepEqual(queries(resolveSiteCss(source, file)), before, file);
    }
});

test('a name that is not a breakpoint is an error, not a silently dead query', () => {
    assert.throws(() => resolveSiteCss('@media (--tiny) { a { color: red } }', 'x.css'), /tiny/);
});

test('the modules unit and the gallery unit ship resolved stylesheets', () => {
    const modules = modulesDist(read, core), gallery = galleryDist(read, core, '', []);
    const css = [...modules].filter(([f]) => f.endsWith('.css') && !f.endsWith('tokens.css')).concat([...gallery].filter(([f]) => f.endsWith('.css')));
    assert.ok(css.length >= 9, 'found the stylesheets');
    for (const [f, text] of css) assert.ok(!/@media\s*\(--/.test(text), `${f} still has a named breakpoint`);
    assert.deepEqual(queries(gallery.get('site.css')), BEFORE['site/site.css']);
    assert.deepEqual(queries(modules.get('modules/theme-editor/theme-editor.css')), BEFORE['modules/theme-editor/theme-editor.css']);
});

test('the dev server answers site and module stylesheets with the real queries', async () => {
    const port = await new Promise(resolve => { const s = net.createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
    const proc = spawn(process.execPath, [path.join(core, 'tools', 'serve.mjs'), String(port)], { stdio: 'ignore' });
    try {
        let res;
        for (let i = 0; i < 60 && !res; i++) { try { res = await fetch(`http://localhost:${port}/site/site.css`); } catch { await new Promise(r => setTimeout(r, 100)); } }
        assert.ok(res?.ok, 'the server answers');
        assert.deepEqual(queries(await res.text()), BEFORE['site/site.css']);
        const mod = await fetch(`http://localhost:${port}/modules/theme-editor/theme-editor.css`);
        assert.deepEqual(queries(await mod.text()), BEFORE['modules/theme-editor/theme-editor.css']);
    } finally { proc.kill(); }
});
