// App framework size budgets (#362, tracker #346 section 4.1). The files are found by folder, so a new file under js/app/ or js/app/pages/ is budgeted the day it exists.
// Keys live in scorecard/scoring.data.js BUDGETS (new keys only; limits only ever come down). Comments are removed before measuring, like the other runtime budgets.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { BUDGETS } from '../site/scorecard/scoring.data.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\n\s+/g, '\n');
const gz = files => zlib.gzipSync(Buffer.from(files.map(f => strip(fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n'))).join('\n'))).length / 1024;
const list = dir => fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith('.js')).map(f => `${dir}/${f}`);

// The static import graph of the entry (what a page pays before it loads any module or page type).
function entryGraph() {
    const seen = new Set();
    const walk = f => {
        if (seen.has(f)) return;
        seen.add(f);
        for (const m of fs.readFileSync(path.join(root, f), 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"\n]*?from\s+'(\.[^']+)'/g)) walk(path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1])));
    };
    walk('js/app.js');
    return [...seen];
}

test('the budget keys exist and each limit is above its target', () => {
    for (const k of ['appEntryGzKb', 'appPageTypeGzKb']) assert.ok(BUDGETS[k]?.limit > BUDGETS[k]?.target, `FIX: add ${k} { target, limit } to BUDGETS in core/site/scorecard/scoring.data.js`);
});

// appEntryGzKb is a HARD CAP, not the usual ratchet-down budget (#514). Splitting the entry graph alone could not reach the tracker #346
// target of 6 KB, so the owner made a one-time, documented exception and revised the limit up to match the actual measured size on main
// at the time (21.84 KB, rounded up to 22). That was a deliberate, one-off decision — it does NOT license raising this number again.
// If this test fails, do not "just make your new code smaller": the entry graph as a whole must not have grown at all. Any PR that adds
// to js/app.js's static import graph must, in the same PR, cut an equal-or-greater amount elsewhere in that graph (e.g. move something to
// load lazily on first use, the way tasks/notify/dialogs already do) so the total stays at or under the limit. Never raise the number.
test('the entry (js/app.js and everything it imports statically) stays inside appEntryGzKb', () => {
    const files = entryGraph();
    const kb = gz(files);
    console.log(`app entry: ${files.length} files, ${kb.toFixed(2)} KB gzip (comments removed)`);
    assert.ok(kb <= BUDGETS.appEntryGzKb.limit, `the app entry graph is ${kb.toFixed(2)} KB gzip, limit ${BUDGETS.appEntryGzKb.limit} (hard cap, #514: never raise this — offset any growth with an equal-or-greater cut elsewhere in the entry graph, or load the new code lazily). Files: ${files.join(', ')}`);
});

test('every js/app/pages/ chunk stays inside appPageTypeGzKb, and every js/app/ file inside the per-module budget', () => {
    const pages = list('js/app/pages');
    assert.ok(pages.length >= 10);
    let worst = 0;
    for (const f of pages) {
        const kb = gz([f]);
        worst = Math.max(worst, kb);
        assert.ok(kb <= BUDGETS.appPageTypeGzKb.limit, `${f} is ${kb.toFixed(2)} KB gzip, limit ${BUDGETS.appPageTypeGzKb.limit}. FIX: make the page type smaller; never raise the budget.`);
    }
    console.log(`page types: ${pages.length} chunks, largest ${worst.toFixed(2)} KB gzip`);
    for (const f of [...list('js/app'), 'js/app.js']) assert.ok(gz([f]) < BUDGETS.jsModuleGzKb.limit, `${f} is over the ${BUDGETS.jsModuleGzKb.limit} KB per-module gzip budget. FIX: split it or make it smaller.`);
});

// Per-module line targets (#362): a ratchet set EQUAL to today's size. A file may shrink (then lower its number here), never grow; a new file
// under js/app/ has no entry, so it fails until it is listed at its own size. Never raise a number.
const LINES = {
    'js/app.js': 8, 'js/app/app.js': 221, 'js/app/boundary.js': 90, 'js/app/config.js': 73,  'js/app/host.js': 291, 'js/app/lazy.js': 41,
    'js/app/module.js': 140, 'js/app/nav.js': 103, 'js/app/shell.js': 58, 'js/app/widget-host.js': 23,
    'js/app/pages/custom.js': 14, 'js/app/pages/dashboard-compose.js': 65, 'js/app/pages/dashboard.js': 17, 'js/app/pages/dashboard-modules.js': 58, 'js/app/pages/dashboard-state.js': 24, 'js/app/pages/doc.js': 31, 'js/app/pages/list.js': 26, 'js/app/pages/master-detail.js': 25,
    'js/app/pages/not-found.js': 20, 'js/app/pages/note.js': 18, 'js/app/pages/print.js': 25, 'js/app/pages/record.js': 43, 'js/app/pages/settings.js': 19,
    'js/app/pages/states.js': 22, 'js/app/pages/svc-dialogs.js': 2, 'js/app/pages/svc-leave-guard.js': 52, 'js/app/pages/svc-notify.js': 2,
    'js/app/pages/svc-page-toasts.js': 15, 'js/app/pages/svc-search.js': 15, 'js/app/pages/svc-tasks.js': 2, 'js/app/pages/svc-mount-page.js': 48, 'js/app/pages/svc-widgets.js': 19, 'js/app/pages/tool.js': 19, 'js/app/pages/wizard.js': 23, 'js/app/pages/workspace.js': 19,
};
const lineCount = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n').split('\n').length - 1;

test('every app framework file stays at or under its line target, and a new file must be listed (ratchet, #362)', () => {
    const files = ['js/app.js', ...list('js/app'), ...list('js/app/pages')];
    for (const f of files) {
        assert.ok(f in LINES, `${f} has no line target. FIX: add it to LINES in core/tests/app-budgets.test.mjs at its current size.`);
        assert.ok(lineCount(f) <= LINES[f], `${f} is ${lineCount(f)} lines, target ${LINES[f]}. FIX: make it smaller or split it; never raise the target.`);
    }
    for (const f of Object.keys(LINES)) assert.ok(files.includes(f), `${f} is gone. FIX: delete its entry from LINES.`);
});

// The same ratchet for the site's own modules (the Gallery dogfoods the framework with lean modules, #362): equal to today's size, never raised.
const MODULE_LINES = { 'devtools.js': 13, 'files.js': 18, 'gallery.js': 50, 'guides.js': 33, 'layout-builder.js': 37, 'scorecard.js': 17, 'settings.js': 38, 'theme.js': 19 };
test('every core/site/modules/ file stays at or under its line target, and a new module must be listed (ratchet, #362)', () => {
    const files = list('site/modules').map(f => path.posix.basename(f));
    for (const f of files) {
        assert.ok(f in MODULE_LINES, `site/modules/${f} has no line target. FIX: add it to MODULE_LINES in core/tests/app-budgets.test.mjs at its current size.`);
        assert.ok(lineCount(`site/modules/${f}`) <= MODULE_LINES[f], `site/modules/${f} is ${lineCount(`site/modules/${f}`)} lines, target ${MODULE_LINES[f]}. FIX: make it smaller or move code into core; never raise the target.`);
    }
    for (const f of Object.keys(MODULE_LINES)) assert.ok(files.includes(f), `site/modules/${f} is gone. FIX: delete its entry from MODULE_LINES.`);
});

// The framework ships no stylesheet of its own (the shell and elements carry theirs): the app-only CSS budget is zero bytes. Never raise it.
const APP_CSS_BYTES = 0;
test('the app framework adds no CSS (app-only CSS budget, #362)', () => {
    const css = [];
    const walk = d => { for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) e.isDirectory() ? walk(`${d}/${e.name}`) : /\.css$/.test(e.name) && css.push(`${d}/${e.name}`); };
    walk('js/app');
    const bytes = css.reduce((n, f) => n + fs.statSync(path.join(root, f)).size, 0);
    assert.ok(bytes <= APP_CSS_BYTES, `js/app has ${bytes} bytes of CSS (${css.join(', ')}), budget ${APP_CSS_BYTES}. FIX: style with tokens inside an element; the app layer has no stylesheet.`);
});
