// Unit tests for pk-print-page: the document stylesheet it adopts while connected (size, margin, no injection), and its removal. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour, { printRules } from './print-page.js';

class Sheet { replaceSync(css) { this.css = css; } }
const make = (props = {}) => {
    const doc = { adoptedStyleSheets: [], defaultView: { CSSStyleSheet: Sheet } };
    const el = new (behaviour(class {
        isConnected = true;
        get ownerDocument() { return doc; }
        warnOnce(key) { (this.warned ??= []).push(key); }
    }))();
    Object.assign(el, { size: '', margin: '15mm' }, props);
    return { el, doc };
};

test('the rules carry @page size and margin and the print-only chrome and break rules', () => {
    const css = printRules('A4 landscape', '20mm 10mm');
    assert.match(css, /@page \{ size: A4 landscape; margin: 20mm 10mm; \}/);
    assert.match(css, /\[data-screen-only\]/);
    assert.match(css, /break-inside: avoid/);
    assert.match(css, /table-header-group/);
    assert.doesNotMatch(printRules('', '15mm'), /size:/);
});

test('updated adopts one sheet; a second update replaces it; disconnected removes it', () => {
    const { el, doc } = make({ size: 'letter' });
    el.updated();
    assert.equal(doc.adoptedStyleSheets.length, 1);
    assert.match(doc.adoptedStyleSheets[0].css, /size: letter;/);
    el.margin = '5mm';
    el.updated();
    assert.equal(doc.adoptedStyleSheets.length, 1);
    assert.match(doc.adoptedStyleSheets[0].css, /margin: 5mm;/);
    el.disconnected();
    assert.equal(doc.adoptedStyleSheets.length, 0);
});

test('a value that is not a length or paper name is refused with a warning, never written into the sheet', () => {
    const { el, doc } = make({ size: 'A4; } body { display: none', margin: '1mm } x {' });
    el.updated();
    assert.doesNotMatch(doc.adoptedStyleSheets[0].css, /size:|body \{|x \{/);
    assert.match(doc.adoptedStyleSheets[0].css, /margin: 15mm;/);
    assert.deepEqual(el.warned, ['bad:size', 'bad:margin']);
});
