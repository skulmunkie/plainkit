// Weight budgets and the score ratchet. Budgets live in scorecard/scoring.data.js.
// Since #1985 step 4 the page layer (10 KB) is the only hard gate here; the element, base runtime, js-module and base-js figures are ADVISORY: this file logs them
// (the element table lists the top 15 and any file above the advisory limit) and fails only at the backstop (BUDGETS.<key>.backstop: 8 KB per element, 2x for the rest).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { BUDGETS } from '../site/scorecard/scoring.data.js';
import { runStaticAudit } from '../site/scorecard/static-audit.mjs';
import { build } from '../tools/build.mjs';
import { listElementFolders } from '../tools/element-folders.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const gzKb = text => zlib.gzipSync(Buffer.from(text)).length / 1024;

test('the page-level stylesheet stays inside its hard gzip budget, and every element inside the element backstop (the 4 KB figure is advisory)', () => {
    const { out } = build({ write: false });
    const gz = f => zlib.gzipSync(Buffer.from(out.get(f))).length / 1024;
    assert.ok(gz('dist/plainkit.css') < BUDGETS.pageCssGzKb.limit, `dist/plainkit.css is ${gz('dist/plainkit.css').toFixed(1)} KB gzip, limit ${BUDGETS.pageCssGzKb.limit} (target ${BUDGETS.pageCssGzKb.target}, Bootstrap 5 about ${BUDGETS.pageCssGzKb.reference})`);
    const modules = [...out.keys()].filter(f => /^dist\/elements\/[^/]+\.js$/.test(f) && !f.endsWith('registry.js'));
    assert.ok(modules.length >= 6);
    const sizes = modules.map(f => ({ name: f.slice('dist/elements/'.length), kb: gz(f) })).sort((a, b) => b.kb - a.kb);
    const shown = sizes.filter((s, i) => i < 15 || s.kb > BUDGETS.elementGzKb.limit);
    console.log(`elements (advisory ${BUDGETS.elementGzKb.limit} KB, backstop ${BUDGETS.elementGzKb.backstop} KB): ${sizes.length} files, ${sizes.filter(s => s.kb > BUDGETS.elementGzKb.limit).length} above the advisory figure\n` + shown.map(s => `  ${s.name.padEnd(32)} ${s.kb.toFixed(2)} KB`).join('\n'));
    for (const s of sizes) assert.ok(s.kb <= BUDGETS.elementGzKb.backstop, `dist/elements/${s.name} is ${s.kb.toFixed(2)} KB gzip, over the backstop ${BUDGETS.elementGzKb.backstop} (the advisory figure is ${BUDGETS.elementGzKb.limit}). FIX: this is an accident, not growth: find what was inlined that should be lazy or shared`);
});

test('the element base runtime stays inside its backstop (advisory limit reported)', () => {
    const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\n\s+/g, '\n').replace(/\n+/g, '\n');
    const kb = ['js/element.js', 'js/element-core.js'].reduce((n, f) => n + gzKb(strip(read(f))), 0);
    console.log(`base runtime: ${kb.toFixed(2)} KB gzip (advisory ${BUDGETS.baseRuntimeGzKb.limit}, backstop ${BUDGETS.baseRuntimeGzKb.backstop})`);
    assert.ok(kb <= BUDGETS.baseRuntimeGzKb.backstop, `base runtime is ${kb.toFixed(2)} KB gzip, over the backstop ${BUDGETS.baseRuntimeGzKb.backstop}`);
});

test('every behaviour module stays inside the per-module backstop and the base set inside its backstop (advisory limits reported)', () => {
    const modules = ['js/theme', 'js/page', 'js/tasks', 'js/notify', 'js/dialogs', 'js/colour', 'js/quality', 'js/scoring', 'js/audit', 'js/plainkit', 'js/code-explorer/element', 'js/code-explorer/providers', 'js/code-explorer/tokenize', 'js/store', 'js/app', 'js/app/module', 'js/app/host', 'js/app/boundary', 'js/app/app', 'js/app/config', 'js/app/nav', 'js/app/shell', 'js/router', 'js/layout-model', 'js/layout-schema', 'js/layout-tree', 'js/layout-validate', 'js/layout-html', 'js/layout-ops', 'js/dock-model', 'js/dock-tree', 'js/dock-float', 'js/dock-json', 'js/custom-sdk-logic', 'js/custom-sdk-breakpoints', 'js/custom-sdk-files', ...fs.readdirSync(path.join(root, 'js/app/pages')).map(f => `js/app/pages/${f.replace(/\.js$/, '')}`)];
    const over = [];
    for (const m of [...modules, 'modules/code-explorer/reports']) {
        const kb = gzKb(read(`${m}.js`));
        if (kb > BUDGETS.jsModuleGzKb.limit) over.push(`${m}.js ${kb.toFixed(2)} KB`);
        assert.ok(kb < BUDGETS.jsModuleGzKb.backstop, `${m}.js is ${kb.toFixed(2)} KB gzip, over the backstop ${BUDGETS.jsModuleGzKb.backstop} KB (advisory ${BUDGETS.jsModuleGzKb.limit})`);
    }
    if (over.length) console.log(`js modules above the advisory ${BUDGETS.jsModuleGzKb.limit} KB: ${over.join(', ')}`);
    const base = ['js/plainkit', 'js/invokers', 'js/log', 'js/loader', 'js/theme', 'js/colour', 'js/dynamic'].map(m => read(`${m}.js`)).join('');
    const baseKb = gzKb(base);
    console.log(`base script set: ${baseKb.toFixed(2)} KB gzip (advisory ${BUDGETS.baseJsGzKb.limit}, backstop ${BUDGETS.baseJsGzKb.backstop})`);
    assert.ok(baseKb < BUDGETS.baseJsGzKb.backstop, `the base script set is ${baseKb.toFixed(2)} KB gzip, over the backstop ${BUDGETS.baseJsGzKb.backstop}`);
});

test('the static score never drops below the recorded baseline (it only goes up)', () => {
    const baseline = JSON.parse(read('site/scorecard/baseline.json'));
    const { scores } = runStaticAudit();
    assert.ok(scores.overall >= baseline.overall, `static overall ${scores.overall} is below the baseline ${baseline.overall}`);
    for (const [k, v] of Object.entries(baseline.categories)) if (v !== null) assert.ok(scores.categories[k].score >= v, `${k} dropped from ${v} to ${scores.categories[k].score}`);
});

test('the stylesheets load no webfont and no font file (system font stack, SVG sprite only)', () => {
    const css = ['tokens/tokens.css', 'base/base.css', read('plainkit.css')].map(t => (t.endsWith('.css') && !t.includes('{') ? read(t) : t)).join('') + listElementFolders(root).map(d => read(`${d.folder}/${d.name}/${d.name}.css`)).join('');
    assert.ok(!/@font-face|fonts\.googleapis|\.woff/.test(css));
});
