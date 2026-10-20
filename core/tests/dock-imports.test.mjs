// pk-dock's element file stays a thin shell (#432 phase D0): persistence and the confirmLayout round trip live in js/dock-flyout.js, and that module
// never imports back into an element folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('dock.js delegates persistence and confirmLayout to dock-flyout.js, which stays out of the element layer', () => {
    const dock = read('components/dock/dock.js');
    assert.match(dock, /from '\.\.\/\.\.\/js\/dock-flyout\.js'/);
    assert.doesNotMatch(dock, /createStore/);
    assert.doesNotMatch(read('js/dock-flyout.js'), /from '\.\.\/(components|elements|pages|shells)\//);
});
