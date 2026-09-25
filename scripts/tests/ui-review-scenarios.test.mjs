import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { groupFindings, loadScenarios, parseArgs } from '../ui-review.mjs';
import { combinations, createExpectations, expectationFinding, keyEvents, mouseEvents, scenarioShotName, selectScenarios, stepsFor, validateScenario } from '../../core/tests/review/scenario.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const good = (over = {}) => ({ name: 'demo', elements: ['side-nav'], html: '<pk-side-nav></pk-side-nav>', steps: [{ click: 'a' }, { shot: 'open' }], expect() {}, ...over });
const VIEWPORTS = [{ name: 'desktop', width: 1280, height: 900 }, { name: 'phone', width: 375, height: 812 }];

test('a valid scenario has no problems', () => {
    assert.deepEqual(validateScenario(good()), []);
    assert.deepEqual(validateScenario(good({ viewports: ['desktop'], themes: ['dark'], steps: [{ hover: 'a', on: ['desktop'] }, { key: 'Shift+Tab', times: 2 }, { shot: 'a' }] })), []);
});

test('scenario validation names every problem', () => {
    const one = (over, re) => { const bad = validateScenario(good(over)); assert.ok(bad.some(m => re.test(m)), `${JSON.stringify(over)} -> ${bad.join(' | ')}`); };
    one({ name: 'Not A Slug' }, /name must be/);
    one({ elements: [] }, /elements must list/);
    one({ elements: ['pk-side-nav'] }, /without pk-/);
    one({ html: '' }, /html must be/);
    one({ html: '<p style="color:red">x</p>' }, /style attributes/);
    one({ viewports: ['tablet'] }, /viewports must be/);
    one({ themes: ['sepia'] }, /themes must be/);
    one({ expect: null }, /expect\(t\)/);
    one({ steps: [] }, /steps must be/);
    one({ steps: [{ click: 'a' }] }, /at least one \{ shot \}/);
    one({ steps: [{ shot: 'a' }, { shot: 'a' }] }, /used twice/);
    one({ steps: [{ shot: 'Bad Name' }] }, /lowercase slug/);
    one({ steps: [{ click: '' }, { shot: 'a' }] }, /must be a selector/);
    one({ steps: [{ click: 'a', hover: 'b' }, { shot: 'a' }] }, /exactly one of/);
    one({ steps: [{ frobnicate: 1 }, { shot: 'a' }] }, /exactly one of/);
    one({ steps: [{ set: 'a' }, { shot: 'a' }] }, /exactly one of attr or prop/);
    one({ steps: [{ set: 'a', attr: 'x', prop: 'y' }, { shot: 'a' }] }, /exactly one of attr or prop/);
    one({ steps: [{ scroll: 'a' }, { shot: 'a' }] }, /\.to must be a number/);
    one({ steps: [{ resize: 0 }, { shot: 'a' }] }, /width in px/);
    one({ steps: [{ wait: 99999 }, { shot: 'a' }] }, /at most 5000/);
    one({ steps: [{ click: 'a', on: ['tablet'] }, { shot: 'a' }] }, /viewport names/);
    assert.ok(validateScenario(good({ elements: ['nope'] }), new Set(['side-nav'])).some(m => /not an element name/.test(m)));
    assert.ok(validateScenario(null)[0].includes('not an object'));
});

test('steps and combinations follow the viewports a scenario names', () => {
    const s = good({ steps: [{ click: 'a', on: ['phone'] }, { hover: 'b' }, { shot: 'x' }] });
    assert.deepEqual(stepsFor(s, 'phone').map(x => Object.keys(x)[0]), ['click', 'hover', 'shot']);
    assert.deepEqual(stepsFor(s, 'desktop').map(x => Object.keys(x)[0]), ['hover', 'shot']);
    assert.equal(combinations(good(), VIEWPORTS, ['light', 'dark']).length, 4);
    assert.deepEqual(combinations(good({ viewports: ['desktop'] }), VIEWPORTS, ['light', 'dark']).map(c => `${c.viewport.name}/${c.theme}`), ['desktop/light', 'desktop/dark']);
    assert.deepEqual(combinations(good({ themes: ['dark'] }), VIEWPORTS, ['light', 'dark']).map(c => `${c.viewport.name}/${c.theme}`), ['desktop/dark', 'phone/dark']);
});

test('scenarios are selected by name, by the elements they are about, or all', () => {
    const all = [good({ name: 'a', elements: ['side-nav'] }), good({ name: 'b', elements: ['page-header', 'tabs'] })];
    assert.deepEqual(selectScenarios(all, { elements: ['tabs'] }).map(s => s.name), ['b']);
    assert.deepEqual(selectScenarios(all, { elements: ['button'] }), []);
    assert.deepEqual(selectScenarios(all, { names: ['a'] }).map(s => s.name), ['a']);
    assert.deepEqual(selectScenarios(all, { every: true }).length, 2);
    assert.throws(() => selectScenarios(all, { names: ['zzz'] }), /no such scenario: zzz \(known: a, b\)/);
});

test('shot names carry the scenario, the state and the combination', () => {
    assert.equal(scenarioShotName('side-nav', 'flyout', 'desktop', 'dark'), 'scenario-side-nav__flyout__desktop__dark.png');
});

test('--scenarios and --scenarios-only take optional names', () => {
    assert.equal(parseArgs([]).scenarios, 'auto');
    assert.equal(parseArgs(['--scenarios']).scenarios, 'all');
    assert.deepEqual(parseArgs(['--scenarios', 'a,b']).scenarios, ['a', 'b']);
    assert.equal(parseArgs(['--scenarios', '--strict']).strict, true);
    const only = parseArgs(['--scenarios-only']);
    assert.equal(only.scenariosOnly, true);
    assert.equal(only.scenarios, 'auto');
    assert.deepEqual(parseArgs(['--scenarios-only', 'side-nav', '--elements', 'x']).scenarios, ['side-nav']);
});

test('input events: keys press and release, modifiers and characters work, unknown keys are refused', () => {
    const tab = keyEvents('Tab');
    assert.deepEqual(tab.map(e => e.type), ['rawKeyDown', 'keyUp']);
    assert.equal(tab[0].windowsVirtualKeyCode, 9);
    assert.equal(keyEvents('Enter')[0].type, 'keyDown');
    assert.equal(keyEvents('Enter')[0].text, '\r');
    assert.equal(keyEvents('Shift+Tab')[0].modifiers, 8);
    assert.equal(keyEvents('a')[0].code, 'KeyA');
    assert.throws(() => keyEvents('Bogus'), /unknown key/);
    assert.throws(() => keyEvents('Hyper+a'), /unknown modifier/);
    assert.deepEqual(mouseEvents('hover', 5, 6).map(e => e.type), ['mouseMoved']);
    assert.deepEqual(mouseEvents('click', 5, 6).map(e => e.type), ['mouseMoved', 'mousePressed', 'mouseReleased']);
});

// A fake page: elements by selector, each { x, y, width, height, visible, text, style: {}, attr: {} }.
const fakeEnv = (els, viewport = { width: 1000, height: 800 }) => ({
    viewport,
    rect: s => (els[s] && els[s].width ? { x: els[s].x, y: els[s].y, width: els[s].width, height: els[s].height } : null),
    count: s => (els[s] ? 1 : 0),
    visible: s => Boolean(els[s]?.visible ?? els[s]?.width),
    text: s => els[s]?.text ?? '',
    style: (s, p) => els[s]?.style?.[p] ?? '',
    attr: (s, n) => els[s]?.attr?.[n] ?? null,
    metric: (s, n) => els[s]?.metric?.[n] ?? 0,
    clipBoxes: s => els[s]?.clips ?? [],
});
const run = (els, fn, context) => { const { t, failures } = createExpectations(fakeEnv(els), context); fn(t); return failures.map(f => f.message); };

test('expectation helpers pass on a good layout and say what is wrong on a bad one', () => {
    const els = { '#bar': { x: 0, y: 0, width: 1000, height: 50 }, '#head': { x: 0, y: 50, width: 1000, height: 80 }, '#a': { x: 10, y: 60, width: 100, height: 20 }, '#b': { x: 500, y: 60, width: 100, height: 20 }, '#hid': { visible: false, x: 0, y: 0, width: 0, height: 0 } };
    assert.deepEqual(run(els, t => { t.flushBelow('#head', '#bar'); t.within('#a', '#head'); t.noOverlap('#a', '#b'); t.sameRow('#a', '#b'); t.inViewport('#a'); t.hidden('#hid'); t.atLeast('#a', 'width', 100); t.centredIn('#head', '#bar'); }), []);
    const bad = run(els, t => { t.flushBelow('#head', '#a'); t.within('#b', '#a'); t.visible('#hid', 'the panel'); t.noOverlap('#bar', '#head', -1); t.exists('#nope'); t.atLeast('#a', 'width', 200); });
    assert.equal(bad.length, 6);
    assert.match(bad[0], /#head starts at y=50, expected flush under #a which ends at y=80/);
    assert.match(bad[1], /#b .* is not inside #a/);
    assert.match(bad[2], /the panel is not visible/);
    assert.match(bad[3], /#bar and #head overlap/);
    assert.match(bad[4], /#nope does not exist/);
    assert.match(bad[5], /is 100px width, expected at least 200px/);
});

test('missing elements are failures, not exceptions', () => {
    assert.deepEqual(run({}, t => { assert.equal(t.rect('#x'), null); t.within('#x', '#y'); }), ['#x was not found (or has no box)', '#x was not found (or has no box)', '#y was not found (or has no box)']);
});

test('a viewport that cuts an element off is reported with the numbers', () => {
    const msgs = run({ '#a': { x: 900, y: 10, width: 200, height: 20 } }, t => t.inViewport('#a'));
    assert.match(msgs[0], /cut off by the 1000x800 viewport/);
});

test('t.known records a warning-severity failure, and t.ok an error', () => {
    const { t, failures } = createExpectations(fakeEnv({}));
    t.known(123, true, 'fine');
    t.known(123, false, 'the gap is 0px');
    t.ok(false, 'broken');
    assert.equal(failures.length, 2);
    assert.equal(failures[0].severity, 'warn');
    assert.match(failures[0].message, /known issue #123: the gap is 0px/);
    assert.match(failures[0].fix, /#123/);
    assert.equal(failures[1].severity, undefined);
    assert.equal(expectationFinding('demo', 'open', failures[0]).severity, 'warn');
    const err = expectationFinding('demo', 'open', failures[1]);
    assert.equal(err.severity, 'error');
    assert.equal(err.rule, 'scenario-expectation');
    assert.match(err.fix, /core\/tests\/review\/scenarios\/demo\.js/);
    assert.equal(err.path, 'demo / open');
});

test('focus rings must exist and fit inside every clipping ancestor and the window', () => {
    const style = { 'outline-style': 'solid', 'outline-width': '2px', 'outline-offset': '2px', 'box-shadow': 'none' };
    const ok = { '#b': { x: 20, y: 20, width: 60, height: 30, style, clips: [{ x: 0, y: 0, width: 200, height: 100 }] } };
    assert.deepEqual(run(ok, t => { t.ringVisible('#b'); t.ringUnclipped('#b'); }), []);
    const clipped = { '#b': { ...ok['#b'], x: 1, clips: [{ x: 0, y: 0, width: 200, height: 100 }] } };
    assert.match(run(clipped, t => t.ringUnclipped('#b'))[0], /focus ring of #b .* is cut off/);
    const none = { '#b': { x: 20, y: 20, width: 60, height: 30, style: { 'outline-style': 'none', 'outline-width': '0px', 'box-shadow': 'none' } } };
    assert.match(run(none, t => t.ringVisible('#b'))[0], /shows no focus ring/);
});

test('scroll helpers read the metrics', () => {
    const els = { '#s': { x: 0, y: 0, width: 10, height: 10, metric: { scrollHeight: 500, clientHeight: 100, scrollTop: 40 } }, '#n': { x: 0, y: 0, width: 10, height: 10, metric: { scrollHeight: 100, clientHeight: 100 } } };
    assert.deepEqual(run(els, t => { t.scrolls('#s'); assert.equal(t.metric('#s', 'scrollTop'), 40); }), []);
    assert.match(run(els, t => t.scrolls('#n'))[0], /does not scroll/);
});

test('scenario shots group into one finding per problem, listing the shots and combinations', () => {
    const f = { rule: 'tap-target', severity: 'warn', path: 'a > b', message: 'm', fix: 'x' };
    const shot = (example, viewport) => ({ tag: 'scenario-demo', scenario: 'demo', example, title: 't', viewport, theme: 'light', findings: [f] });
    const grouped = groupFindings([shot('rest', 'phone'), shot('open', 'phone'), shot('open', 'desktop'), shot('a', 'phone'), shot('b', 'phone')]);
    assert.equal(grouped.length, 1);
    assert.deepEqual(grouped[0].seen, ['phone/light', 'desktop/light']);
    assert.equal(grouped[0].example, 'rest, open, a and 1 more');
    const ex = groupFindings([{ tag: 'pk-x', example: 1, title: 't', viewport: 'phone', theme: 'light', findings: [f] }, { tag: 'pk-x', example: 2, title: 't', viewport: 'phone', theme: 'light', findings: [f] }]);
    assert.equal(ex.length, 2, 'element examples stay one line per example');
});

test('every scenario file in core/tests/review/scenarios is valid and about a real element', async () => {
    const registry = (await import(pathToFileURL(path.join(root, 'core', 'elements', 'registry.js')).href).catch(() => null))?.default;
    if (!registry) return; // the registry is generated: `node scripts/bootstrap.mjs` first
    const known = new Set(Object.keys(registry).map(t => t.slice(3)));
    const all = await loadScenarios(undefined, known);
    assert.ok(all.length >= 7, 'the scenarios for the states that shipped unseen are there');
    for (const s of all) {
        assert.ok(s.steps.some(x => 'shot' in x), `${s.name} takes a screenshot`);
        const source = fs.readFileSync(path.join(root, 'core', 'tests', 'review', 'scenarios', `${s.name}.js`), 'utf8');
        assert.doesNotMatch(source, /_ISSUE = 0|known\(0,/, `${s.name} has a t.known with no issue number`);
    }
});
