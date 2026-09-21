// Contract checks for the app-shell element: template, stylesheet and meta API describe the same thing. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const read = ext => fs.readFileSync(fileURLToPath(new URL(`./app-shell.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json'));
const prop = name => meta.props.find(p => p.name === name);

// Issue #21: the body padding could not be removed, so a workspace could not sit edge to edge.
test('flush is a boolean prop that removes the body padding but keeps the safe-area insets', () => {
    assert.equal(prop('flush').type, 'boolean'); assert.equal(prop('flush').default, false); assert.equal(prop('flush').reflect, true);
    const rule = read('css').match(/:host\(\[flush\]\) \[part="body"\] \{([^}]*)\}/);
    assert.ok(rule, 'a flush body rule');
    assert.match(rule[1], /padding: 0;/);
    assert.match(rule[1], /env\(safe-area-inset-left\)/);
});
