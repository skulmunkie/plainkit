// #797: ElementInternals.setValidity throws when a flag is true and the message is empty, which is what a disabled (barred) inner
// control reports for a mismatching value. Every control that forwards the inner validity must guard on willValidate.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { elementFile } from '../tools/element-folders.mjs';

const read = f => fs.readFileSync(elementFile(path.basename(f), 'js'), 'utf8'); // f = '<name>/<name>'

for (const f of ['input/input', 'textarea/textarea', 'select/select', 'unit-input/unit-input', 'checkbox/checkbox']) {
    test(`${f} reports no validity flags while its inner control is barred from validation`, () => {
        const src = read(f);
        assert.match(src, /setValidity\(\w+\.willValidate \? flagsOf\(\w+\.validity\) : \{\}, /);
        assert.doesNotMatch(src, /setValidity\(flagsOf\(/);
    });
}
