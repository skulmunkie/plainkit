// Contract checks for the select element: template, stylesheet and meta API describe the same thing. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// #1406: select-menu really cancels pk-close (close() opens only when emit returns true), so the metadata says it is cancelable (the generated Blazor callback documents that a .NET callback cannot cancel it).
test('select-menu pk-close is declared cancelable, pk-open and pk-change are not', () => {
    const meta = JSON.parse(fs.readFileSync(new URL('./select-menu.meta.json', import.meta.url), 'utf8'));
    const by = Object.fromEntries(meta.events.map(e => [e.name, e]));
    assert.equal(by['pk-close'].cancelable, true);
    assert.notEqual(by['pk-open'].cancelable, true);
    assert.notEqual(by['pk-change'].cancelable, true);
});
