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

test('the entry (js/app.js and everything it imports statically) stays inside appEntryGzKb', () => {
    const files = entryGraph();
    const kb = gz(files);
    console.log(`app entry: ${files.length} files, ${kb.toFixed(2)} KB gzip (comments removed)`);
    assert.ok(kb <= BUDGETS.appEntryGzKb.limit, `the app entry graph is ${kb.toFixed(2)} KB gzip, limit ${BUDGETS.appEntryGzKb.limit}. FIX: make the source smaller or load the code lazily; never raise the budget. Files: ${files.join(', ')}`);
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
