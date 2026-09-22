// The size sweep's pure parts: the count of level-1 headings (real h1 elements and role="heading" aria-level="1", inside shadow trees too) and the routes it visits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { countH1, routes, WIDTHS, THEMES, items, signature, settled, QUIET_POLLS, closestDeep } from '../site/scorecard/sweep.js';

const flatten = kids => kids.flatMap(k => [k, ...k.querySelectorAll('*')]);
const el = (localName, attrs = {}, kids = [], shadow = null) => ({ localName, getAttribute: n => attrs[n] ?? null, shadowRoot: shadow, querySelectorAll: () => flatten(kids) });
const root = kids => ({ querySelectorAll: () => flatten(kids) });

test('countH1 counts h1 elements and level-1 role=heading, in the light tree and in shadow trees, and nothing else', () => {
    assert.equal(countH1(root([])), 0);
    assert.equal(countH1(root([el('h1'), el('h2'), el('div', { role: 'heading', 'aria-level': '2' })])), 1);
    assert.equal(countH1(root([el('div', { role: 'heading', 'aria-level': '1' })])), 1);
    const header = el('pk-page-header', {}, [], root([el('div', { role: 'heading', 'aria-level': '1' })]));
    assert.equal(countH1(root([header])), 1, 'the title pk-page-header draws in its shadow tree is the page h1');
    assert.equal(countH1(root([header, el('h1')])), 2, 'two level-1 headings are counted as two');
});

test('the sweep covers six widths and both themes, and every gallery view, template, pattern and layout has a route', () => {
    assert.deepEqual(WIDTHS, [320, 375, 640, 1024, 1280, 1920]);
    assert.deepEqual(THEMES, ['dark', 'light']);
    const r = routes();
    for (const need of ['#/overview', '#/elements', '#/samples/templates', '#/samples/patterns', '#/samples/layouts']) assert.ok(r.includes(need), need);
    assert.equal(new Set(r).size, r.length, 'no route twice');
    assert.ok(r.some(x => x.startsWith('#/elements/pk-')));
});

test('the items are in a fixed order, one per view, template and element example, and a filter keeps the names that contain a fragment', () => {
    const all = items();
    assert.equal(new Set(all.map(i => i.name)).size, all.length, 'no name twice');
    assert.equal(all.filter(i => i.kind === 'views').length, routes().length);
    assert.ok(all.filter(i => i.kind === 'samples').length > 90 && all.filter(i => i.kind === 'templates').length > 0);
    assert.deepEqual(items().map(i => i.name), all.map(i => i.name), 'the same order every time');
    assert.deepEqual([...new Set(items({ kinds: ['samples'] }).map(i => i.kind))], ['samples']);
    const tabs = items({ filter: ['pk-tabs#', 'gallery #/overview'] }).map(i => i.name);
    assert.ok(tabs.includes('gallery #/overview') && tabs.some(n => n.startsWith('sample pk-tabs#')) && tabs.every(n => n.includes('pk-tabs#') || n === 'gallery #/overview'));
    assert.match(all.find(i => i.kind === 'samples').doc('light'), /data-theme="light"/);
});

// A document reduced to what signature() reads.
function fakeDoc({ tags = [], shadowTags = [], ready = 'complete', boot = false, linksLoaded = true, width = 300, tall = 500, defined = [] } = {}) {
    const shadow = { querySelectorAll: () => shadowTags.map(t => ({ localName: t })) };
    const host = tags.map((t, i) => ({ localName: t, shadowRoot: i === 0 && shadowTags.length ? shadow : null }));
    return {
        readyState: ready, fonts: { status: 'loaded' }, documentElement: { scrollWidth: width, scrollHeight: tall },
        body: { querySelectorAll: () => host }, querySelectorAll: () => [{ sheet: linksLoaded ? {} : null }], getElementById: id => (boot && id === 'boot-notice' ? {} : null),
        defaultView: { customElements: { get: n => (defined.includes(n) ? function () { } : undefined) } },
    };
}

test('a frame is ready when loaded, styled, with every toolkit element defined and the boot notice gone; the reading changes with the layout', () => {
    const defined = ['pk-button', 'pk-page-header'];
    assert.equal(signature(fakeDoc({ tags: ['div', 'pk-button'], defined })).ready, true);
    assert.equal(signature(fakeDoc({ tags: ['div', 'pk-button'], defined: [] })).ready, false, 'an element that is not defined yet has no size');
    assert.equal(signature(fakeDoc({ tags: ['div', 'my-thing'], defined: [] })).ready, true, 'a tag the toolkit does not define is not waited for');
    assert.equal(signature(fakeDoc({ tags: ['div'], boot: true })).ready, false, 'the gallery boot notice is still there');
    assert.equal(signature(fakeDoc({ tags: ['div'], ready: 'loading' })).ready, false);
    assert.equal(signature(fakeDoc({ tags: ['div'], linksLoaded: false })).ready, false, 'a half-styled frame is not measured');
    assert.equal(signature(fakeDoc({ tags: [] })).ready, false, 'nothing in the body yet');
    assert.equal(signature({ documentElement: null, defaultView: null }).ready, false, 'a frame in the middle of a navigation has no document element');
    assert.equal(signature(fakeDoc({ tags: ['pk-page-header'], shadowTags: ['h1'], defined })).ready, true);
    const same = signature(fakeDoc({ tags: ['div'] })).text;
    assert.equal(signature(fakeDoc({ tags: ['div'] })).text, same);
    assert.notEqual(signature(fakeDoc({ tags: ['div'], width: 320 })).text, same, 'a resize shows');
    assert.notEqual(signature(fakeDoc({ tags: ['div'], tall: 900 })).text, same);
    assert.notEqual(signature(fakeDoc({ tags: ['pk-page-header'], shadowTags: ['h1'], defined })).text, signature(fakeDoc({ tags: ['pk-page-header'], defined })).text, 'a late render in a shadow tree shows');
});

test('closestDeep finds a match in one tree like closest(), and keeps going past a shadow boundary via the host', () => {
    const lightRoot = { host: null }; // a plain document has no host to hop to
    const light = { closest: sel => (sel === '.match' ? light : null), getRootNode: () => lightRoot };
    assert.equal(closestDeep(light, '.match'), light);
    assert.equal(closestDeep(light, '.nope'), null, 'no match anywhere, and nothing to hop to');

    const host = { closest: sel => (sel === '[hidden]' ? host : null), getRootNode: () => lightRoot };
    const shadowRoot = { host };
    const inner = { closest: () => null, getRootNode: () => shadowRoot };
    assert.equal(closestDeep(inner, '[hidden]'), host, 'not found inside the shadow tree; found on the host once the search crosses the boundary');
    assert.equal(closestDeep(inner, '.nowhere'), null, 'still not found after reaching the host, with no further boundary to cross');
});

test('settled waits for the frame to be ready and quiet, and gives up with the reading at the timeout', async () => {
    const docs = [fakeDoc({ tags: ['div'], boot: true }), fakeDoc({ tags: ['div'], boot: true }), fakeDoc({ tags: ['div', 'x'] }), fakeDoc({ tags: ['div', 'x', 'y'] })];
    let reads = 0; const frame = { get contentDocument() { return docs[Math.min(reads++, docs.length - 1)]; } };
    await settled(frame, { timeout: 5000 });
    assert.ok(reads >= 3 + QUIET_POLLS, `it read ${reads} times: not ready twice, then changing, then quiet for ${QUIET_POLLS} polls`);
    await assert.rejects(settled({ contentDocument: fakeDoc({ tags: ['div'], boot: true }) }, { timeout: 200 }), /did not settle within 0.2 s \(not ready/);
});
