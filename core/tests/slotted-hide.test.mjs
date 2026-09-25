// A Blazor named-slot wrapper is <span slot="x" class="u-contents"> and the page rule `.u-contents { display: contents !important }` beats any
// ::slotted rule from an element's shadow tree (issue 297; element CSS may not use !important). So an element rule must not hide a slotted node
// by its slot attribute; it hides the <slot> element instead, which renders none of its assigned nodes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const elements = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'elements');

export function slottedSlotHides(css) {
    const out = [];
    for (const m of css.matchAll(/::slotted\(\[slot=[^\]]*\]\)\s*\{([^}]*)\}/g)) if (/display\s*:\s*none/.test(m[1])) out.push(m[0]);
    return out;
}

test('the scanner flags a slot-attribute ::slotted hide and accepts hiding the slot', () => {
    assert.equal(slottedSlotHides(':host([c]) ::slotted([slot="brand"]) { display: none; }').length, 1);
    assert.equal(slottedSlotHides(':host([c]) slot[name="brand"] { display: none; }').length, 0);
});

test('no element hides a named-slot node through ::slotted', () => {
    for (const dir of fs.readdirSync(elements, { withFileTypes: true })) {
        if (!dir.isDirectory()) continue;
        for (const f of fs.readdirSync(path.join(elements, dir.name)).filter(n => n.endsWith('.css'))) {
            const bad = slottedSlotHides(fs.readFileSync(path.join(elements, dir.name, f), 'utf8'));
            assert.deepEqual(bad, [], `${dir.name}/${f}: hide the <slot> element instead (a display: contents slot wrapper would win over ::slotted)`);
        }
    }
});
