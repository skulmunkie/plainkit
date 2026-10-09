// Unit tests for the tray's pure rules. The layout, focus and keyboard behaviour are checked in the browser suite (tests/browser/cases-tray.js)
// and the review scenario (tray).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SIZES, EDGES, sizeOf, launcherTitle } from './tray.js';
import { matchesHotkey } from '../../js/hotkey.js';

test('the three sizes and the four edges are what the meta declares', () => {
    const meta = JSON.parse(fs.readFileSync(new URL('./tray.meta.json', import.meta.url), 'utf8'));
    assert.deepEqual(meta.props.find(p => p.name === 'size').values, SIZES);
    assert.deepEqual(meta.props.find(p => p.name === 'edge').values, EDGES);
});

test('a size is one of the three or nothing', () => {
    assert.equal(sizeOf('large'), 'large');
    assert.equal(sizeOf('huge'), null);
    assert.equal(sizeOf(null), null);
});

test('the launcher names its chord only when there is one', () => {
    assert.equal(launcherTitle('Open tools', 'Ctrl+`'), 'Open tools (Ctrl+`)');
    assert.equal(launcherTitle('Open tools', ''), 'Open tools');
});

test('the hotkey matches the key and only the modifiers the chord names', () => {
    assert.ok(matchesHotkey({ key: '`', ctrlKey: true }, 'Ctrl+`'));
    assert.ok(matchesHotkey({ key: '`', metaKey: true }, 'Ctrl+`'), 'Cmd counts as Ctrl');
    assert.ok(matchesHotkey({ key: 'D', ctrlKey: true, shiftKey: true }, 'Ctrl+Shift+D'));
    assert.ok(!matchesHotkey({ key: '`' }, 'Ctrl+`'), 'the modifier is required');
    assert.ok(!matchesHotkey({ key: '`', ctrlKey: true, altKey: true }, 'Ctrl+`'), 'an extra modifier is not a match');
    assert.ok(!matchesHotkey({ key: '`', ctrlKey: true }, ''), 'an empty chord is off');
});

test('the tray adds its one document listener on connect and removes the same function on disconnect', () => {
    const src = fs.readFileSync(new URL('./tray.js', import.meta.url), 'utf8');
    assert.match(src, /connected\(\) \{[\s\S]*addEventListener\('keydown', this\.\$k\)/);
    assert.match(src, /disconnected\(\) \{ this\.ownerDocument\.removeEventListener\('keydown', this\.\$k\)/);
});
