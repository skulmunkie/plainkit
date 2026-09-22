// Gallery chrome contract checks for issue #142: the pagebar's title heading, the nav's phone touch targets, and the fill/flush pairing
// a workspace template needs to reach the shell's edges.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pagebarTitleAttrs } from '../site/gallery/gallery.js';

const read = (dir, file) => fs.readFileSync(fileURLToPath(new URL(`../${dir}/${file}`, import.meta.url)), 'utf8');

// The gallery pagebar's title: a full-page preview (a template, pattern or layout route) has no pk-page-header, so the pagebar title
// (core/site/gallery/gallery.js) is the page's only heading and must carry level-1 heading semantics only while it is actually showing.
// A route that is not full must not leave a second, hidden h1 in the DOM (the sweep's h1 counter, core/site/scorecard/sweep.js, does not
// look at [hidden] or display: none, so an h1 left in the DOM but hidden by CSS still doubles the count).
test("the pagebar title is a level-1 heading only in a full view, where it is the page's only heading", () => {
    assert.deepEqual(pagebarTitleAttrs(true), { role: 'heading', 'aria-level': '1' });
    assert.deepEqual(pagebarTitleAttrs(false), {}, 'not full: no heading role, so it never doubles the gallery page\'s own h1');
});

// The nav's own section-title links (a.gx-nav-title) are not a pk-* element, so they need their own 44px phone tap target, the same as the
// slotted brand link pk-side-nav already sizes.
test('the nav section-title links get a 44px minimum tap target on a phone', () => {
    const css = read('site/gallery', 'gallery.css');
    const phoneBlock = css.match(/@media \(max-width: 640px\) \{([\s\S]*)\}\s*$/)[1];
    assert.match(phoneBlock, /\.gx-nav-title\s*\{[^}]*min-height:\s*var\(--touch-target\)/, '44px target on a phone');
});

// A fill template (a workspace) must reach the shell's own edges: the shell needs flush so pk-app-shell drops the page gutter that would
// otherwise leave the workspace short of the footer strip (issue #142, sub-issue 4).
test('a fill template sets flush on the shell so the workspace body has no page gutter', () => {
    const js = read('samples/templates', 'chrome.js');
    assert.match(js, /if \(fill\) shell\.setAttribute\('flush', ''\);/);
});
