// Unit tests for the workspace component's behaviour, run against the fake DOM. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, el, FakeEvent } from '../../tests/fake-dom.mjs';
import { initWorkspaces, visiblePanels, showsNav } from './workspace.js';

const workspaceFixture = () => {
    const doc = createDocument();
    const navTab = el(doc, 'button.tab.tab--phone-only', { 'data-pk-workspace-nav': '' });
    const one = el(doc, 'button.tab.active', { 'data-pk-panel': 'one' });
    const two = el(doc, 'button.tab', { 'data-pk-panel': 'two' });
    const tabs = el(doc, 'div.tabs', { 'data-pk-tabs': 'toggle' }, navTab, one, two);
    const p1 = el(doc, 'div', { 'data-pk-panel-id': 'one' });
    const p2 = el(doc, 'div', { 'data-pk-panel-id': 'two' });
    const pane = el(doc, 'div.workspace-pane', {}, p1, p2);
    const main = el(doc, 'main.workspace-main', {}, tabs, pane);
    const ws = el(doc, 'div.workspace', { 'data-pk-workspace': '' }, el(doc, 'aside.workspace-nav'), main);
    doc.documentElement.append(ws);
    return { doc, ws, navTab, one, two, p1, p2 };
};

test('workspace: the phone-only nav tab shows the rail, any other tab hides it again', () => {
    const { doc, ws, navTab, two } = workspaceFixture();
    initWorkspaces(doc);
    navTab.click();
    assert.equal(ws.classList.contains('workspace--nav'), true);
    two.click();
    assert.equal(ws.classList.contains('workspace--nav'), false);
});

test('workspace: selecting a tab with a panel shows that panel and hides the others', () => {
    const { doc, two, p1, p2 } = workspaceFixture();
    initWorkspaces(doc);
    two.click();
    assert.equal(p2.hidden, false);
    assert.equal(p1.hidden, true);
});

test('workspace: visiblePanels and showsNav are pure', () => {
    assert.deepEqual(visiblePanels(['a', 'b'], 'b'), [{ id: 'a', visible: false }, { id: 'b', visible: true }]);
    assert.equal(showsNav({ navTab: true }), true);
    assert.equal(showsNav({}), false);
});
