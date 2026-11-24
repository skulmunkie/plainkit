// The runtime hook for breakpoints of your own (#124): the rules are the ones plainkit-breakpoints.css has, and a bad entry is left out, never half-written.
import './needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readBreakpointList, breakpointRules } from '../js/breakpoint-classes.js';
import { responsiveCss } from '../js/custom-sdk-ruler.js';

test('the rules agree with the exported plainkit-breakpoints.css', () => {
    const list = [{ name: 'portrait', width: 768 }, { name: 'laptop', width: 1400 }];
    const css = responsiveCss(list);
    for (const [cond, sel] of breakpointRules(list)) assert.ok(css.includes(`@media ${cond} { ${sel} { display: none !important; } }`), `${cond} ${sel}`);
    assert.equal(breakpointRules(list).length, 4);
});

test('a settings object and a plain list read the same; bad entries are dropped', () => {
    const ok = { name: 'big', width: 1500 };
    assert.deepEqual(readBreakpointList({ ownBreakpoints: [ok] }), [ok]);
    assert.deepEqual(readBreakpointList([ok]), [ok]);
    assert.deepEqual(readBreakpointList([{ name: 'Big', width: 1500 }, { name: 'a-b', width: 900 }, { name: 'x', width: 1.5 }, { name: 'y', width: 0 }, null, ok]), [ok]);
    assert.deepEqual(readBreakpointList(undefined), []);
});
