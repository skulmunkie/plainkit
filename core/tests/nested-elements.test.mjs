// An element that renders other pk-* elements inside its own shadow tree must ask the loader to define them (loadElements(this.shadowRoot)): the loader only
// scans the page's light DOM, so on a page that uses none of those elements itself they stay inert, unstyled (issue 272: the phone tab strip of
// pk-detail-layout rendered as "DetailsPricing" on a page with no tabs of its own).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';

const root = new URL('../elements/', import.meta.url);

test('every element whose shadow template nests pk-* tags loads them through the loader', () => {
    const missing = [];
    for (const name of readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)) {
        const element = new URL(`${name}/${name}.element.js`, root);
        if (!existsSync(element)) continue;
        const template = readFileSync(element, 'utf8').split(/\r?\n/).find(l => l.includes('static template'));
        const nested = [...new Set((template?.match(/<pk-[a-z-]+/g) ?? []).map(t => t.slice(1)))];
        if (!nested.length) continue;
        const source = readFileSync(new URL(`${name}/${name}.js`, root), 'utf8');
        if (!/loadElements\s*\(/.test(source)) missing.push(`pk-${name} nests ${nested.join(', ')} but never calls loadElements`);
    }
    assert.deepEqual(missing, [], 'call loadElements(this.shadowRoot) (see image-gallery) so the nested elements are defined on any page');
});
