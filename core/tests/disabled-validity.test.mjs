// #797: ElementInternals.setValidity throws when a flag is true and the message is empty, which is what a disabled (barred) inner
// control reports for a mismatching value. Every control that forwards the inner validity must guard on willValidate.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = f => fs.readFileSync(fileURLToPath(new URL(`../elements/${f}.js`, import.meta.url)), 'utf8');

for (const f of ['input/input', 'textarea/textarea', 'select/select', 'unit-input/unit-input', 'checkbox/checkbox']) {
    test(`${f} reports no validity flags while its inner control is barred from validation`, () => {
        const src = read(f);
        assert.match(src, /setValidity\(\w+\.willValidate \? flagsOf\(\w+\.validity\) : \{\}, /);
        assert.doesNotMatch(src, /setValidity\(flagsOf\(/);
    });
}
