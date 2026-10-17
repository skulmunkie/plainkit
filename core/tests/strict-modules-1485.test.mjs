// #1485: a lazy module owns its .css/.html inside its own folder; srcdoc is a reviewed, counted exception.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFiles } from '../tools/strict/engine.mjs';
import '../tools/audit/module-ruleset.mjs';

const rulesOf = files => checkFiles(files, { ruleset: 'module' }).map(f => f.rule);
const OK_CSS = '.a { color: var(--color-text); }';

test('module-owned .css and .html inside core/modules/<x>/ or core/site/<x>/ pass S1 and S10', () => {
    const rules = rulesOf([
        { path: 'core/modules/foo/foo.css', text: OK_CSS },
        { path: 'core/site/bar/preview.html', text: '<link rel="stylesheet" href="bar.css">' },
        { path: 'core/site/site.css', text: OK_CSS },
    ]);
    assert.ok(!rules.includes('S1') && !rules.includes('S10'), `FIX: module-owned assets must not fire S1/S10, got ${rules}`);
});

test('a module-owned stylesheet still fails S9 on a literal colour', () => {
    assert.ok(rulesOf([{ path: 'core/modules/foo/foo.css', text: '.a { color: #ff0000; }' }]).includes('S9'), 'FIX: tokens-only must still be enforced');
});

test('stray .css/.html outside a module folder still fail S1 and S10', () => {
    for (const p of ['core/stray.css', 'core/modules/loose.css', 'core/site/other.css', 'core/site/loose.html']) {
        assert.ok(rulesOf([{ path: p, text: OK_CSS }]).includes('S10'), `FIX: ${p} must fail S10`);
    }
    assert.ok(rulesOf([{ path: 'core/stray.css', text: OK_CSS }]).includes('S1'), 'FIX: stray css must fail S1');
});

test('a .js file inside a module folder still fails S1 for an embedded <style>', () => {
    assert.ok(rulesOf([{ path: 'core/modules/foo/foo.js', text: "const s = '<style>a{}</style>';" }]).includes('S1'), 'FIX: only .css/.html are exempt');
});

test('srcdoc is allowed only in the listed files and only up to the listed count', () => {
    assert.ok(!rulesOf([{ path: 'core/site/gallery/frame.js', text: 'frame.srcdoc = doc;' }]).includes('S5'), 'FIX: the listed srcdoc must pass');
    assert.ok(rulesOf([{ path: 'core/site/gallery/frame.js', text: 'a.srcdoc = 1; b.srcdoc = 2;' }]).includes('S5'), 'FIX: a second srcdoc in a one-count file must fail');
    assert.ok(rulesOf([{ path: 'core/modules/foo/foo.js', text: 'frame.srcdoc = doc;' }]).includes('S5'), 'FIX: srcdoc outside the list must fail');
    assert.ok(rulesOf([{ path: 'core/site/gallery/frame.js', text: 'el.innerHTML = x;' }]).includes('S5'), 'FIX: innerHTML is never covered by the srcdoc exception');
});
