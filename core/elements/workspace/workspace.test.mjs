// Unit tests for the workspace's pure logic (which panes exist, which shows, arrow keys). The DOM behaviour is in tests/browser/cases-workspace.js. Run: node --test core
import test from 'node:test';
import assert from 'node:assert/strict';
import { visiblePanels, showsNav, availablePanes, resolvePane, paneKey, PANES } from './workspace.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

test('workspace: visiblePanels and showsNav are pure', () => {
    assert.deepEqual(visiblePanels(['a', 'b'], 'b'), [{ id: 'a', visible: false }, { id: 'b', visible: true }]);
    assert.deepEqual(visiblePanels(['a'], 'zzz'), [{ id: 'a', visible: false }]);
    assert.equal(showsNav('nav'), true);
    assert.equal(showsNav('main'), false);
    assert.equal(showsNav(undefined), false);
});

test('workspace: the main pane always exists; nav and aside only when they have content, the aside only when open', () => {
    assert.deepEqual(PANES, ['nav', 'main', 'aside']);
    assert.deepEqual(availablePanes(), ['main']);
    assert.deepEqual(availablePanes({ nav: true }), ['nav', 'main']);
    assert.deepEqual(availablePanes({ nav: true, aside: true }), ['nav', 'main']);
    assert.deepEqual(availablePanes({ nav: true, aside: true, asideOpen: true }), ['nav', 'main', 'aside']);
    assert.deepEqual(availablePanes({ aside: true, asideOpen: true }), ['main', 'aside']);
    assert.deepEqual(availablePanes({ asideOpen: true }), ['main'], 'an open aside with no content is not a pane');
});

test('workspace: a pane that does not exist falls back to the main pane', () => {
    assert.equal(resolvePane('nav', ['nav', 'main']), 'nav');
    assert.equal(resolvePane('aside', ['nav', 'main']), 'main');
    assert.equal(resolvePane('nav', ['main']), 'main');
});

test('workspace: arrow keys, Home and End move between the panes that exist and wrap', () => {
    const p = ['nav', 'main', 'aside'];
    assert.equal(paneKey('ArrowRight', p, 'nav'), 'main');
    assert.equal(paneKey('ArrowRight', p, 'aside'), 'nav');
    assert.equal(paneKey('ArrowLeft', p, 'nav'), 'aside');
    assert.equal(paneKey('ArrowDown', p, 'main'), 'aside');
    assert.equal(paneKey('ArrowUp', p, 'main'), 'nav');
    assert.equal(paneKey('Home', p, 'aside'), 'nav');
    assert.equal(paneKey('End', p, 'nav'), 'aside');
    assert.equal(paneKey('x', p, 'nav'), null);
    assert.equal(paneKey('ArrowRight', p, 'gone'), null);
    assert.equal(paneKey('ArrowRight', [], 'main'), null);
});
const read = ext => fs.readFileSync(fileURLToPath(new URL(`./workspace.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json'));
const prop = name => meta.props.find(p => p.name === name);

// Issue #21: one padding variable for every pane; each pane now has its own hook that falls back to it.
test('each pane has its own padding hook, falling back to the shared one, and all are in the meta', () => {
    const css = read('css'); const names = meta.cssProperties.map(p => p.name);
    for (const pane of ['nav', 'main', 'aside']) {
        assert.ok(names.includes(`--pk-workspace-${pane}-pad`), pane);
        assert.ok(css.includes(`[part="${pane}"] { padding: var(--pk-workspace-${pane}-pad, var(--_pad))`), pane);
    }
    assert.ok(css.includes('--_pad: var(--pk-workspace-pad, var(--pad-panel))'));
    assert.ok(names.includes('--pk-workspace-pad'));
});
