// Weight budgets and the score ratchet. Budgets live in scorecard/scoring.data.js; limits only ever come down.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { BUDGETS } from '../site/scorecard/scoring.data.js';
import { runStaticAudit } from '../site/scorecard/static-audit.mjs';
import { build } from '../tools/build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const gzKb = text => zlib.gzipSync(Buffer.from(text)).length / 1024;

test('the page-level stylesheet, the compat layer and every element stay inside their own gzip budgets', () => {
    const { out } = build({ write: false });
    const gz = f => zlib.gzipSync(Buffer.from(out.get(f))).length / 1024;
    assert.ok(gz('dist/plainkit.css') < BUDGETS.pageCssGzKb.limit, `dist/plainkit.css is ${gz('dist/plainkit.css').toFixed(1)} KB gzip, limit ${BUDGETS.pageCssGzKb.limit} (target ${BUDGETS.pageCssGzKb.target}, Bootstrap 5 about ${BUDGETS.pageCssGzKb.reference})`);
    assert.ok(gz('dist/plainkit-compat.css') <= BUDGETS.compatCssGzKb.limit, `the compat layer grew to ${gz('dist/plainkit-compat.css').toFixed(2)} KB gzip, limit ${BUDGETS.compatCssGzKb.limit}: it only ever shrinks`);
    const modules = [...out.keys()].filter(f => /^dist\/elements\/[^/]+\.js$/.test(f) && !f.endsWith('registry.js'));
    assert.ok(modules.length >= 6);
    for (const f of modules) assert.ok(gz(f) <= BUDGETS.elementGzKb.limit, `${f} is ${gz(f).toFixed(2)} KB gzip, limit ${BUDGETS.elementGzKb.limit}`);
});

test('the element base runtime stays inside its budget', () => {
    const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\n\s+/g, '\n').replace(/\n+/g, '\n');
    const kb = ['js/element.js', 'js/element-core.js'].reduce((n, f) => n + gzKb(strip(read(f))), 0);
    assert.ok(kb <= BUDGETS.baseRuntimeGzKb.limit, `base runtime is ${kb.toFixed(2)} KB gzip, limit ${BUDGETS.baseRuntimeGzKb.limit}`);
});

test('every behaviour module stays inside the per-module gzip budget and the base set stays small', () => {
    const modules = ['components/modal/modal', 'components/tabs/tabs', 'components/topbar/topbar', 'components/workspace/workspace', 'components/nav/nav', 'js/theme', 'js/colour', 'js/quality', 'js/scoring', 'js/audit', 'js/plainkit', 'js/code-explorer/element', 'js/code-explorer/providers', 'js/code-explorer/tokenize'];
    for (const m of modules) assert.ok(gzKb(read(`${m}.js`)) < BUDGETS.jsModuleGzKb.limit, `${m}.js is over ${BUDGETS.jsModuleGzKb.limit} KB gzip`);
    const base = ['components/modal/modal', 'components/tabs/tabs', 'components/topbar/topbar', 'components/workspace/workspace', 'components/nav/nav', 'js/theme', 'js/colour', 'js/plainkit'].map(m => read(`${m}.js`)).join('');
    assert.ok(gzKb(base) < BUDGETS.baseJsGzKb.limit, 'the base script set grew past its budget');
});

test('the static score never drops below the recorded baseline (it only goes up)', () => {
    const baseline = JSON.parse(read('site/scorecard/baseline.json'));
    const { scores } = runStaticAudit();
    assert.ok(scores.overall >= baseline.overall, `static overall ${scores.overall} is below the baseline ${baseline.overall}`);
    for (const [k, v] of Object.entries(baseline.categories)) if (v !== null) assert.ok(scores.categories[k].score >= v, `${k} dropped from ${v} to ${scores.categories[k].score}`);
});

test('the stylesheets load no webfont and no font file (system font stack, SVG sprite only)', () => {
    const css = ['tokens/tokens.css', 'base/base.css', read('plainkit.css')].map(t => (t.endsWith('.css') && !t.includes('{') ? read(t) : t)).join('') + fs.readdirSync(path.join(root, 'elements')).filter(d => fs.statSync(path.join(root, 'elements', d)).isDirectory()).map(d => read(`elements/${d}/${d}.css`)).join('');
    assert.ok(!/@font-face|fonts\.googleapis|\.woff/.test(css));
});
