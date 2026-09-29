// core/tools/usage-index.mjs (issue #577): the "where is pk-X used" counting and grouping logic, table-driven against synthetic
// file lists rather than the real repo - classify() and buildIndex() are pure, so a fake set of (path, text) entries is enough.
import test from 'node:test';
import assert from 'node:assert/strict';
import { kebab, nodeToElement, elementsInMarkup, elementsInScript, elementsInMeta, classify, buildIndex, zeroReferenced, mostComposedBy, CATEGORIES } from '../tools/usage-index.mjs';

test('kebab: PascalCase component names become element folder names', () => {
    assert.equal(kebab('Accordion'), 'accordion');
    assert.equal(kebab('AccordionItem'), 'accordion-item');
    assert.equal(kebab('DateRangePicker'), 'date-range-picker');
});

test('nodeToElement: a pk- tag or a Pk component maps to a known element, else null', () => {
    const names = new Set(['button', 'accordion-item']);
    assert.equal(nodeToElement({ kind: 'tag', name: 'pk-button' }, names), 'button');
    assert.equal(nodeToElement({ kind: 'tag', name: 'div' }, names), null);
    assert.equal(nodeToElement({ kind: 'tag', name: 'pk-nope' }, names), null);
    assert.equal(nodeToElement({ kind: 'component', name: 'PkAccordionItem' }, names), 'accordion-item');
    assert.equal(nodeToElement({ kind: 'component', name: 'PkNope' }, names), null);
    assert.equal(nodeToElement({ kind: 'component', name: 'MyComponent' }, names), null);
});

test('elementsInMarkup: every referenced element once, sorted, unknown tags ignored', () => {
    const names = new Set(['button', 'icon', 'card']);
    const html = '<pk-card><pk-button><pk-icon name="x"></pk-icon> Go</pk-button><pk-button>Again</pk-button></pk-card><div>plain</div>';
    assert.deepEqual(elementsInMarkup(html, names), ['button', 'card', 'icon']);
});

test('elementsInMarkup: a Razor component tag is recognised the same way', () => {
    const names = new Set(['dialog', 'button']);
    assert.deepEqual(elementsInMarkup('<PkDialog><PkButton>Close</PkButton></PkDialog>', names), ['button', 'dialog']);
});

test('elementsInScript: JSX tags and tags built inside a JS template literal are both found', () => {
    const names = new Set(['tabs', 'tab']);
    const jsxLike = 'const el = <pk-tabs><pk-tab>One</pk-tab></pk-tabs>;';
    assert.deepEqual(elementsInScript(jsxLike, names), ['tab', 'tabs']);

    const templateLike = 'root.innerHTML = `<pk-tabs><pk-tab>One</pk-tab></pk-tabs>`;';
    assert.deepEqual(elementsInScript(templateLike, names), ['tab', 'tabs']);

    assert.deepEqual(elementsInScript('const x = 1 + 2;', names), []);
});

test('elementsInMeta: pulls tags out of an element meta.json\'s examples[].html', () => {
    const names = new Set(['button', 'icon']);
    const meta = JSON.stringify({ examples: [{ html: '<pk-button>Go</pk-button>' }, { html: '<pk-icon name="x"></pk-icon>' }] });
    assert.deepEqual(elementsInMeta(meta, names), ['button', 'icon']);
    assert.deepEqual(elementsInMeta('not json', names), []);
    assert.deepEqual(elementsInMeta('{}', names), []);
});

test('classify: routes repo-relative paths to a category (or null to skip), and names the owning element', () => {
    assert.deepEqual(classify('core/elements/accordion/accordion.html'), { category: 'elements', owner: 'accordion' });
    assert.deepEqual(classify('core/elements/accordion/accordion.js'), { category: 'elements', owner: 'accordion' });
    assert.deepEqual(classify('core/elements/accordion/accordion.meta.json'), { category: 'gallery', owner: 'accordion' });
    assert.equal(classify('core/elements/accordion/accordion.element.js'), null); // generated
    assert.equal(classify('core/elements/accordion/accordion.test.mjs'), null); // test file
    assert.equal(classify('core/elements/accordion/accordion.css'), null); // not markup or script

    assert.deepEqual(classify('core/modules/scorecard/scorecard.js'), { category: 'site', owner: null });
    assert.deepEqual(classify('core/site/gallery/gallery.js'), { category: 'gallery', owner: null });
    assert.equal(classify('core/site/gallery/gallery.data.js'), null); // generated
    assert.deepEqual(classify('core/site/guides/content/theming.md'), { category: 'docs', owner: null });
    assert.equal(classify('core/site/guides/guides.data.js'), null); // generated
    assert.deepEqual(classify('core/site/devtools/devtools.html'), { category: 'site', owner: null });
    assert.deepEqual(classify('core/samples/patterns/data-display/data-display.html'), { category: 'samples', owner: null });
    assert.deepEqual(classify('scripts/skills/plainkit-sdk/SKILL.md'), { category: 'docs', owner: null });
    assert.deepEqual(classify('blazor/mappings/accordion.json'), { category: 'blazor', owner: 'accordion' });
    assert.equal(classify('blazor/src/PlainKit.Blazor/Generated/Accordion.g.cs'), null);
});

test('buildIndex: counts distinct files per category, per element; every known element gets an entry even at zero', () => {
    const names = ['button', 'icon', 'unused'];
    const entries = [
        { relPath: 'core/elements/card/card.html', category: 'elements', refs: ['button'] },
        { relPath: 'core/site/gallery/gallery.js', category: 'gallery', refs: ['button', 'icon'] },
        { relPath: 'core/samples/a.html', category: 'samples', refs: ['button'] },
        { relPath: 'blazor/mappings/button.json', category: 'blazor', refs: ['button'] },
    ];
    const index = buildIndex(entries, names);
    assert.deepEqual(Object.keys(index).sort(), ['button', 'icon', 'unused']);
    assert.equal(index.button.total, 4);
    assert.deepEqual(index.button.files.elements, ['core/elements/card/card.html']);
    assert.deepEqual(index.button.files.samples, ['core/samples/a.html']);
    assert.equal(index.icon.total, 1);
    assert.deepEqual(index.icon.files.gallery, ['core/site/gallery/gallery.js']);
    assert.equal(index.unused.total, 0);
    for (const c of CATEGORIES) assert.ok(Array.isArray(index.unused.files[c]));
});

test('buildIndex: a reference to a name outside the known element set is ignored rather than crashing', () => {
    const index = buildIndex([{ relPath: 'x.html', category: 'site', refs: ['removed-element'] }], ['button']);
    assert.equal(index.button.total, 0);
});

test('zeroReferenced: elements with no references anywhere, sorted', () => {
    const index = buildIndex([{ relPath: 'x.html', category: 'site', refs: ['button'] }], ['button', 'zebra', 'apple']);
    assert.deepEqual(zeroReferenced(index), ['apple', 'zebra']);
});

test('mostComposedBy: elements referenced from other elements\' own files, most first, ties by name, zero excluded', () => {
    const entries = [
        { relPath: 'core/elements/card/card.html', category: 'elements', refs: ['button', 'icon'] },
        { relPath: 'core/elements/dialog/dialog.html', category: 'elements', refs: ['button'] },
        { relPath: 'core/elements/tabs/tabs.html', category: 'elements', refs: ['icon'] },
    ];
    const index = buildIndex(entries, ['button', 'icon', 'unused']);
    assert.deepEqual(mostComposedBy(index), [{ name: 'button', count: 2 }, { name: 'icon', count: 2 }]);
    assert.deepEqual(mostComposedBy(index, 1), [{ name: 'button', count: 2 }]);
});
