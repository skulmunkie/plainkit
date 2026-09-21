// The text-size policy (site/scorecard/scoring.data.js, TEXT_TIERS and META_TEXT): the tiers and the tokens agree, and the list of secondary text names
// only elements and classes that exist today (it once named the classes of the removed class-based components, so every pk-badge read as small reading text).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { META_TEXT, TEXT_TIERS } from '../site/scorecard/scoring.data.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT_PX = 14; // base/base.css: html { font-size: 14px }
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const rem = (css, name) => { const m = new RegExp(`${name}:\\s*([\\d.]+)rem`).exec(css); return m ? Number(m[1]) * ROOT_PX : null; };

test('the tiers and the tokens agree: --text-read is the reading floor, --text-meta (and its phone value) is at or above the secondary floor', () => {
    const tokens = read('tokens/tokens.css');
    assert.equal(rem(tokens, '--text-read'), TEXT_TIERS.readingPx);
    const metas = [...tokens.matchAll(/--text-meta:\s*([\d.]+)rem/g)].map(m => Number(m[1]) * ROOT_PX);
    assert.ok(metas.length >= 1, '--text-meta is a rem value');
    for (const px of metas) assert.ok(px >= TEXT_TIERS.metaPx, `--text-meta is ${px}px, under the ${TEXT_TIERS.metaPx}px secondary floor`);
    assert.ok(TEXT_TIERS.metaPx < TEXT_TIERS.readingPx);
    assert.equal(read('base/base.css').includes(`font-size: ${ROOT_PX}px`), true, 'the root size the tiers assume');
});

test('every entry of the secondary-text list has a reason and the selector string is exactly the list', () => {
    assert.ok(META_TEXT.length > 5);
    for (const [selector, reason] of META_TEXT) { assert.ok(selector.trim(), 'a selector'); assert.ok(reason.length > 10, `${selector} has a reason`); }
    assert.equal(TEXT_TIERS.metaSelectors, META_TEXT.map(([s]) => s).join(', '));
});

test('every element the list names exists and sets its own text at the meta size; every class it names is in the source', () => {
    const dirs = fs.readdirSync(path.join(root, 'elements'), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
    const tags = new Set(); const classes = new Set();
    for (const [selector] of META_TEXT) {
        for (const m of selector.matchAll(/\bpk-[a-z][a-z-]*/g)) tags.add(m[0]);
        for (const m of selector.matchAll(/\.([a-z][\w-]*)/g)) classes.add(m[1]);
    }
    for (const tag of tags) {
        const name = tag.slice(3);
        assert.ok(dirs.includes(name), `${tag} is an element`);
        const css = fs.readdirSync(path.join(root, 'elements', name)).filter(f => f.endsWith('.css')).map(f => read(`elements/${name}/${f}`)).join('\n');
        assert.match(css, /--text-(meta|xs|sm)\b/, `${tag} does not use the meta size in its css, so it should not be listed as secondary text`);
    }
    const files = [];
    const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (['dist', 'node_modules', 'tests'].includes(e.name)) continue; const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(css|js|html)$/.test(e.name) && !/scoring\.data|\.element\.js|gallery\.data|quality\.js|sweep\.js/.test(e.name)) files.push(p); } };
    walk(root);
    const text = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');
    for (const c of classes) assert.ok(text.includes(c), `.${c} is not in any source file: a class of a removed component does not belong in the list`);
});
