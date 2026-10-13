// The scorecard route fetches core/site/scorecard/sweep-report.json, which only a local `scorecard-sweep --write-report` writes. A load of the route on a tree
// without one used to log "request failed: 404" (the pages sweep failed on it). The build now leaves an empty marker, and the section paints it as an empty state.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { root, isGenerated } from '../generated.mjs';

const file = path.join(root, 'core', 'site', 'scorecard', 'sweep-report.json');

test('a built tree has a sweep report file (the marker or a real report), listed as generated', () => {
    assert.ok(isGenerated('core/site/scorecard/sweep-report.json'));
    assert.ok(fs.existsSync(file), 'run node scripts/bootstrap.mjs: the build writes the marker');
    const r = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.ok(r.none === true || r.checked > 0, 'either the empty marker or a report with cells');
});

test('the sweep section paints the marker as an empty state, not as a report', async () => {
    const { paintSweep } = await import('../../core/modules/scorecard/sections.js');
    const doc = { createElement: tag => ({ tag, children: [], textContent: '', className: '', setAttribute() {}, append(...c) { this.children.push(...c); } }) };
    let painted;
    paintSweep(doc, { replaceChildren: (...c) => { painted = c; } }, { none: true, checked: 0, widths: [], themes: [] });
    assert.equal(painted.length, 1);
    assert.match(JSON.stringify(painted), /No size sweep has been recorded yet/);
});
