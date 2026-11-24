// Rendered text contrast (js/rendered-contrast.js, #107 step 4): the rating and the token lookup are pure; the document reader is checked in the browser suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rateBoxes, tokensBehind, AA_TEXT, AA_LARGE } from '../js/rendered-contrast.js';
import { MODULES } from '../tools/modules-dist.mjs';

const box = (over = {}) => ({ selector: 'p', text: 'Hello', fg: 'rgb(16, 16, 16)', bg: 'rgb(18, 18, 18)', size: 16, bold: false, ...over });

test('only boxes below AA are reported, worst first, grouped by colour pair', () => {
    const rows = rateBoxes([box(), box({ selector: 'span' }), box({ fg: 'rgb(255, 255, 255)' }), box({ fg: 'rgb(90, 90, 90)', bg: 'rgb(18, 18, 18)' })]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].fg, 'rgb(16, 16, 16)');
    assert.equal(rows[0].count, 2);
    assert.ok(rows[0].ratio < rows[1].ratio && rows[1].ratio < AA_TEXT);
});

test('large text needs 3:1, not 4.5:1', () => {
    const mid = { fg: 'rgb(110, 110, 110)', bg: 'rgb(255, 255, 255)' };   // about 5:1
    const light = { fg: 'rgb(140, 140, 140)', bg: 'rgb(255, 255, 255)' };   // about 3.4:1
    assert.equal(rateBoxes([box({ ...mid })]).length, 0);
    assert.equal(rateBoxes([box({ ...light })]).length, 1);
    assert.equal(rateBoxes([box({ ...light, size: 24 })]).length, 0);
    assert.equal(rateBoxes([box({ ...light, size: 19, bold: true })]).length, 0);
    assert.equal(rateBoxes([box({ ...light, size: 19 })]).length, 1);
    assert.equal(AA_LARGE, 3);
});

test('an unreadable colour is not a finding', () => {
    assert.deepEqual(rateBoxes([box({ fg: 'oklch(0.5 0.1 100)' })]), []);
});

test('tokensBehind names the colour tokens that hold a computed colour', () => {
    const values = { '--color-text': '#101010', '--color-fg': '#101010', '--color-bg': '#121212', '--space-1': '4px', '--color-veil': 'rgba(16, 16, 16, 0.5)' };
    assert.deepEqual(tokensBehind('rgb(16, 16, 16)', Object.keys(values), n => values[n]), ['--color-text', '--color-fg']);
    assert.deepEqual(tokensBehind('rgb(1, 2, 3)', Object.keys(values), n => values[n]), []);
    assert.deepEqual(tokensBehind('nonsense', Object.keys(values), n => values[n]), []);
});

test('audit-tab.js ships in the theme editor folder, loads on demand and rendered-contrast.js is not in the core package', () => {
    assert.ok(MODULES['theme-editor'].files.includes('audit-tab.js') && MODULES['theme-editor'].files.includes('sample-boot.js'));
    const source = fs.readFileSync(new URL('../modules/theme-editor/theme-editor.js', import.meta.url), 'utf8');
    assert.match(source, /import\('\.\/audit-tab\.js'\)/);
    assert.ok(!/^import .*audit-tab/m.test(source));
    assert.match(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'), /!dist\/js\/rendered-contrast\.js/);
});
