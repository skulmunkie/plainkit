import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// #1589: a field-spec member must serialise under the key the element documents (maxlength, not maxLength), or the element ignores it.
const root = new URL('../../', import.meta.url);
const read = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const meta = read('core/components/field-group/field-group.meta.json');
const list = /field specs, in order: \{ (.*?) \}\. kind is/.exec(JSON.stringify(meta))?.[1];
const camel = n => n[0].toLowerCase() + n.slice(1);

test('every fieldMembers entry serialises under a key of the documented field spec', () => {
  assert.ok(list, 'the field-group meta no longer documents the spec keys as { key, label, ... }');
  const keys = new Set(list.split(',').map(k => k.trim().replace(/[?:].*$/, '')).filter(Boolean));
  const bad = read('blazor/mappings/field-group.json').fieldMembers
    .map(m => ({ name: m.name, wire: m.json ?? camel(m.name) }))
    .filter(m => !keys.has(m.wire));
  assert.deepEqual(bad, [], `these members are sent under a name the element does not read: ${JSON.stringify(bad)}. FIX: add "json": "<documented key>" to the entry in blazor/mappings/field-group.json`);
});
