// The brand palette generator (js/brand-palette-logic.js): every documented AA pair meets 4.5:1 in both themes, whatever the brand colour.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseTokenBlocks } from '../js/theme.js';
import { contrast } from '../js/colour.js';
import { emptyOverrides, overrideCount, effectiveValue } from '../js/theme-editor-logic.js';
import { AA_PAIRS, generatePalette, applyPalette, paletteRows, hslToHex, normalizeColour, toHsl } from '../js/brand-palette-logic.js';
import { TEXT_PAIRS } from '../site/scorecard/scoring.data.js';

const tokens = parseTokenBlocks(fs.readFileSync(new URL('../tokens/tokens.css', import.meta.url), 'utf8'));

const assertAA = (p, label) => {
    assert.ok(!p.error, `${label}: ${p.error}`);
    for (const r of paletteRows(p.overrides, tokens)) {
        assert.notEqual(r.ratio, null, `${label}: ${r.theme} ${r.fg} on ${r.bg} is not a literal colour (${r.fgValue} on ${r.bgValue})`);
        assert.ok(r.ratio >= 4.5, `${label}: ${r.theme} ${r.fg} on ${r.bg} is ${r.ratio.toFixed(2)}:1`);
    }
};

test('the scorecard text pairs are all in the shared AA pair list', () => {
    const key = p => p.join('|');
    const have = new Set(AA_PAIRS.map(key));
    for (const p of TEXT_PAIRS) assert.ok(have.has(key(p)), `${key(p)} is graded by the scorecard but not by the generator`);
});

test('property: a grid of hues, saturations and lightnesses, extremes included, never yields a pair below 4.5:1', () => {
    let n = 0;
    const hues = [0, 25, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
    for (const l of [0, 0.02, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 0.97, 1]) for (const s of [0, 0.15, 0.5, 1]) for (const h of (s === 0 ? [0] : hues)) {
        const hex = hslToHex(h, s, l);
        assertAA(generatePalette(hex, { warn: hslToHex((h + 40) % 360, s, l) }), `brand ${hex}`);
        assertAA(generatePalette(hex, { neutral: hslToHex((h + 180) % 360, s, 1 - l) }), `brand ${hex} with a neutral`);
        n += 2;
    }
    assert.ok(n > 500);
    for (const hex of ['#000000', '#ffffff', '#808080', '#767676', '#777777', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff', '#fffffe', '#010101']) assertAA(generatePalette(hex, { warn: hex }), hex);
});

test('property: random brand colours (seeded) never yield a pair below 4.5:1', () => {
    let seed = 20260921;
    const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    for (let i = 0; i < 400; i++) {
        const hex = `#${Math.floor(rand() * 0x1000000).toString(16).padStart(6, '0')}`;
        assertAA(generatePalette(hex), hex);
    }
});

test('the default accent colour needs no move on the light theme, and says when it moves on the dark one', () => {
    const p = generatePalette('#1d4ed8');
    assert.equal(p.brand, '#1d4ed8');
    assert.equal(p.overrides.light['--color-accent'], '#1d4ed8', 'the brand colour is used as is where it already passes');
    assert.equal(p.overrides.light['--color-accent-fill'], '#1d4ed8');
    assert.ok(p.notes.every(n => !n.startsWith('light')), 'nothing moved on the light theme');
    assert.ok(p.moved && p.notes.some(n => n.startsWith('dark') && n.includes('#1d4ed8')), 'a dark blue is too dark as text on the dark panel');
});

test('a brand colour that passes on a theme is used as it is there, and only the other theme moves it', () => {
    const p = generatePalette('#6e6e6e');
    assert.equal(p.overrides.light['--color-accent'], '#6e6e6e');
    assert.equal(p.overrides.light['--color-accent-fill'], '#6e6e6e');
    assert.equal(p.overrides.dark['--color-accent-fill'], '#6e6e6e', 'white on it passes on dark too');
    assert.ok(p.notes.length === 1 && p.notes[0].startsWith('dark') && p.notes[0].includes('accent'), p.notes.join(' '));
});

test('extreme brands are moved, the notes say so with the reached ratio, and greys stay grey', () => {
    for (const hex of ['#ffffff', '#000000', '#fefefe', '#020202']) {
        const p = generatePalette(hex);
        assert.equal(p.moved, true, hex);
        assert.ok(p.notes.length > 0 && p.notes.every(n => /\d\.\d\d:1/.test(n)), `${hex}: ${p.notes.join(' ')}`);
    }
    for (const theme of ['dark', 'light']) for (const [name, value] of Object.entries(generatePalette('#808080').overrides[theme])) {
        const { s } = toHsl(parseHex(value));
        assert.equal(s, 0, `${theme} ${name} ${value} keeps the grey`);
    }
});

const parseHex = v => ({ r: parseInt(v.slice(1, 3), 16), g: parseInt(v.slice(3, 5), 16), b: parseInt(v.slice(5, 7), 16) });

test('a colour it cannot read is an error and produces no overrides', () => {
    for (const bad of ['', 'blue', 'var(--x)', '#12', 'url(evil)', null, undefined]) assert.ok(generatePalette(bad).error, String(bad));
    assert.ok(generatePalette('#123456', { neutral: 'nope' }).error);
    assert.ok(generatePalette('#123456', { warn: 'nope' }).error);
    assert.equal(generatePalette('#f0a').brand, '#ff00aa');
    assert.equal(generatePalette('rgb(255, 0, 170)').brand, '#ff00aa');
    assert.equal(normalizeColour('#ABC'), '#aabbcc');
});

test('every generated name and value passes the SDK override rules, so the export keeps all of it', async () => {
    const { buildOverrides } = await import('../js/theme.js');
    const p = generatePalette('#e11d74', { warn: '#c2410c', neutral: '#334155' });
    const built = buildOverrides(p.overrides);
    assert.deepEqual(built.rejected, []);
    assert.equal(built.css.includes('--color-accent-fill'), true);
});

test('applying a palette gives ordinary edits: the user can change them, and re-applying replaces them', () => {
    const p = generatePalette('#e11d74');
    const applied = applyPalette(emptyOverrides(), p.overrides, tokens);
    assert.ok(overrideCount(applied) > 10);
    assert.equal(effectiveValue(applied, tokens, 'light', '--color-accent'), p.overrides.light['--color-accent']);
    assert.equal(contrast(effectiveValue(applied, tokens, 'dark', '--color-text'), effectiveValue(applied, tokens, 'dark', '--color-bg')) >= 7, true);
    const again = applyPalette(applied, generatePalette('#0d9488').overrides, tokens);
    assert.equal(effectiveValue(again, tokens, 'light', '--color-accent'), generatePalette('#0d9488').overrides.light['--color-accent']);
    assert.equal(JSON.stringify(applied.dark) === JSON.stringify(applyPalette(applied, p.overrides, tokens).dark), true, 'idempotent');
});
