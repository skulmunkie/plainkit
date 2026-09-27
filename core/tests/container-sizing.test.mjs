// A `:host` that declares `container-type: inline-size` (issue #403, found by #402: pk-detail-layout collapsed to 0 width and shattered its
// text) needs an explicit inline size on the same host. `container-type: inline-size` applies `contain: inline-size`, which strips the
// content-based sizing information flex and grid layout would otherwise use to size the item — so a container-query host with no explicit
// width silently collapses to 0 width when it lands as a flex or grid item, instead of erroring. `page-header` and `toolbar` already carry
// the fix (`inline-size: 100%` alongside `container-type: inline-size`); this test holds every other element to the same rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The declarations of the first `:host { ... }` rule in an element's CSS (ignoring `:host(...)` functional selectors, which are a different
// rule), as a lowercase Set of property names. `null` when the file has no plain `:host` rule at all.
export function hostDeclarations(css) {
    const m = css.match(/(?:^|\n|\})\s*:host\s*\{([^}]*)\}/);
    if (!m) return null;
    return new Set(m[1].split(';').map(d => d.split(':')[0]?.trim().toLowerCase()).filter(Boolean));
}

// An explicit inline size: `inline-size`, `width`, or a shorthand that sets one (`inset-inline`/`inset` are position, not size, so excluded on purpose).
const SIZE_PROPS = ['inline-size', 'width', 'min-inline-size', 'min-width'];

test('hostDeclarations reads the plain :host rule, not :host(...)', () => {
    assert.deepEqual(hostDeclarations(':host { display: block; container-type: inline-size; }'), new Set(['display', 'container-type']));
    assert.equal(hostDeclarations(':host(.foo) { color: red; }'), null);
    assert.deepEqual(hostDeclarations(':host(.foo) { color: red; }\n:host { inline-size: 100%; container-type: inline-size; }'), new Set(['inline-size', 'container-type']));
});

test('every :host with container-type: inline-size also sets an explicit inline size', () => {
    const dir = path.join(root, 'elements');
    const bad = [];
    for (const name of fs.readdirSync(dir)) {
        const file = path.join(dir, name, `${name}.css`);
        if (!fs.existsSync(file)) continue;
        const css = fs.readFileSync(file, 'utf8');
        if (!/:host\s*\{[^}]*container-type\s*:\s*inline-size/.test(css)) continue;
        const decls = hostDeclarations(css) ?? new Set();
        if (!decls.has('container-type')) continue; // container-type is on a :host(...) variant, not the plain host: a different, size-established case
        if (!SIZE_PROPS.some(p => decls.has(p))) bad.push(`elements/${name}/${name}.css`);
    }
    assert.deepEqual(bad, [], `:host declares container-type: inline-size with no explicit inline-size/width (issue #403): without one, the host silently collapses to 0 width as a flex or grid item instead of erroring.\n${bad.join('\n')}\nFix: add "inline-size: 100%;" (or a min-inline-size) to the same :host rule, the way elements/page-header/page-header.css and elements/toolbar/toolbar.css already do.`);
});
