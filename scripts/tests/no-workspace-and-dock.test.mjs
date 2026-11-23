// #593 (revisit trigger a): a page or template that draws both pk-workspace and pk-dock is two overlapping layout systems on one screen.
// Decision rule: pk-workspace unless the user needs to resize, tab, move or save the arrangement; then pk-dock, and then only pk-dock.
// If this fails, the two elements are being used for one job: pick one, and say on issue #593 that the rule needs revisiting.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dirs = ['core/samples', 'core/pages', 'core/shells', 'core/site', 'core/modules'];
const skip = new Set(['node_modules', 'guides', 'scorecard', 'files']);
const exts = new Set(['.html', '.js', '.json']);

function* walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (skip.has(e.name)) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) yield* walk(p);
        else if (exts.has(path.extname(e.name)) && !/\.test\.mjs$|\.data\.js$|snapshot\.json$/.test(e.name)) yield p;
    }
}
// The tag as markup (an opening tag), not a mention in prose or a comment.
const opens = (text, tag) => new RegExp(`<${tag}[\\s>/]`).test(text);

test('no page or template contains both pk-workspace and pk-dock', () => {
    const both = [];
    for (const d of dirs) {
        const abs = path.join(root, d);
        if (!fs.existsSync(abs)) continue;
        for (const f of walk(abs)) {
            const text = fs.readFileSync(f, 'utf8');
            if (opens(text, 'pk-workspace') && opens(text, 'pk-dock')) both.push(path.relative(root, f).split(path.sep).join('/'));
        }
    }
    assert.deepEqual(both, [], `FIX: use pk-workspace for fixed nav, main and aside panes, or pk-dock when the user resizes, tabs, moves or saves the arrangement, not both on one page (#593). Found in: ${both.join(', ')}`);
});
