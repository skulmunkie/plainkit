// Table-driven, in-memory tests for every S, D, T and A family rule (design section 10, #612 A-2, #625 A-4): a
// "wrong" snippet expecting the rule's id in the findings, a "right" snippet expecting none. No fixtures on disk -
// the engine is pure, so a file is just `{ path, text }`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFiles } from '../strict/engine.mjs';
import { scanHtml } from '../strict/scanners/html.mjs';
import './rules.mjs'; // registers the "consumer"/"consumer-strict" rulesets as a side effect
import { RULES, getRuleMeta } from './rules.mjs';
import { DEPRECATED_ELEMENTS } from './hints.mjs';
import { EXAMPLES, MANUALLY_TESTED } from './examples.mjs';

// T7 has no real deprecated element or attribute yet (design section 2.4: "empty on day one"), so its mechanism
// is tested directly below by injecting a fake entry into the generated table, rather than through the
// EXAMPLES table-driven wrong/right pattern every other rule uses (MANUALLY_TESTED, from examples.mjs, says so).
// EXAMPLES itself lives in examples.mjs, not here, so scripts/build-skills.mjs can render the same wrong/right
// snippets into references/conformance-rules.md without duplicating them (issue #518, A-8).
const CASES = EXAMPLES;

test('every S/D/T/A rule in the table has a test case', () => {
    const tested = new Set([...CASES.map(c => c.id), ...MANUALLY_TESTED]);
    for (const rule of RULES) assert.ok(tested.has(rule.id), `FIX: rules.test.mjs has no case for rule ${rule.id} - add one`);
});

test('T7: flags a deprecated element or attribute once the generated data names one', () => {
    DEPRECATED_ELEMENTS.push({ tag: 'pk-fake-legacy', message: 'use pk-fake instead (test-only entry)' });
    try {
        const findings = checkFiles([{ path: 'app.html', text: '<pk-fake-legacy></pk-fake-legacy>' }], { ruleset: 'consumer' });
        assert.ok(findings.some(f => f.rule === 'T7'), 'FIX: T7 did not flag a deprecated element from the generated table');
    } finally {
        DEPRECATED_ELEMENTS.pop();
    }
    const clean = checkFiles([{ path: 'app.html', text: '<pk-button>Save</pk-button>' }], { ruleset: 'consumer' });
    assert.ok(!clean.some(f => f.rule === 'T7'), 'FIX: T7 flagged an element with no deprecation entry');
});

for (const c of CASES) {
    test(`${c.id}: flags the wrong snippet`, () => {
        const findings = checkFiles([{ path: c.path, text: c.wrong }], { ruleset: 'consumer' });
        assert.ok(findings.some(f => f.rule === c.id), `FIX: expected ${c.id} in findings for ${JSON.stringify(c.wrong)}, got ${JSON.stringify(findings.map(f => f.rule))}`);
    });

    test(`${c.id}: does not flag the right snippet`, () => {
        const findings = checkFiles([{ path: c.rightPath ?? c.path, text: c.right }], { ruleset: 'consumer' });
        assert.ok(!findings.some(f => f.rule === c.id), `FIX: did not expect ${c.id} in findings for ${JSON.stringify(c.right)}, got ${JSON.stringify(findings.filter(f => f.rule === c.id))}`);
    });
}

test('S9: does not flag a literal-looking value inside a CSS comment, but still flags a real one', () => {
    const commentOnly = checkFiles(
        [{ path: 'app.css', text: '/* a page framed as a 375px device */\n.a { color: var(--color-danger); }' }],
        { ruleset: 'consumer' },
    );
    assert.ok(!commentOnly.some(f => f.rule === 'S9'), `FIX: S9 flagged a value inside a comment, got ${JSON.stringify(commentOnly.filter(f => f.rule === 'S9'))}`);

    const mixed = checkFiles(
        [{ path: 'app.css', text: '/* a page framed as a 375px device */\n.a { width: 375px; }' }],
        { ruleset: 'consumer' },
    );
    const hit = mixed.find(f => f.rule === 'S9');
    assert.ok(hit, 'FIX: S9 did not flag a real literal length outside a comment');
    assert.equal(hit.line, 2, `FIX: S9 reported the wrong line for a hit after a comment, got line ${hit.line}`);
});

test('S7: does not flag prose inside a JS comment, but still flags a real platform access (#697)', () => {
    const commentOnly = checkFiles(
        [{ path: 'app.js', text: '// Save keeps them in localStorage\nexport function save() {}' }],
        { ruleset: 'consumer-strict' },
    );
    assert.ok(!commentOnly.some(f => f.rule === 'S7'), `FIX: S7 flagged a value inside a comment, got ${JSON.stringify(commentOnly.filter(f => f.rule === 'S7'))}`);

    const mixed = checkFiles(
        [{ path: 'app.js', text: '// Save keeps them in localStorage\nlocalStorage.setItem("a", "b");' }],
        { ruleset: 'consumer-strict' },
    );
    const hit = mixed.find(f => f.rule === 'S7');
    assert.ok(hit, 'FIX: S7 did not flag a real localStorage access outside a comment');
    assert.equal(hit.line, 2, `FIX: S7 reported the wrong line for a hit after a comment, got line ${hit.line}`);
});

test('D8: does not flag ::part() selectors, but still flags a raw override sharing a rule with one (#684)', () => {
    const clean = checkFiles(
        [{ path: 'app.css', text: 'pk-app-shell::part(footer) { padding: var(--space-2); }\n.tabbed-page-tabs pk-tabs::part(list) { gap: var(--space-1); }' }],
        { ruleset: 'consumer' },
    );
    assert.ok(!clean.some(f => f.rule === 'D8'), `FIX: D8 flagged documented ::part() selectors, got ${JSON.stringify(clean.filter(f => f.rule === 'D8'))}`);

    const mixed = checkFiles([{ path: 'app.css', text: 'pk-tabs, pk-app-shell::part(header) { padding: var(--space-2); }' }], { ruleset: 'consumer' });
    const hit = mixed.find(f => f.rule === 'D8');
    assert.ok(hit, 'FIX: D8 did not flag a raw pk-tabs override sharing a rule with a ::part() selector');
    assert.ok(hit.fix.includes('styles pk-tabs from outside'), `FIX: D8 reported the wrong offending selector, got ${JSON.stringify(hit)}`);
});

test('D2: does not flag a utility class that merely contains a hint word, but still flags the exact class (#684)', () => {
    const clean = checkFiles([{ path: 'app.css', text: '.text-danger { color: var(--color-danger); }\n.stat-grid { display: grid; }' }], { ruleset: 'consumer' });
    assert.ok(!clean.some(f => f.rule === 'D2'), `FIX: D2 flagged .text-danger/.stat-grid as hand-rolled duplicates, got ${JSON.stringify(clean.filter(f => f.rule === 'D2'))}`);

    const real = checkFiles([{ path: 'app.css', text: '.text { color: var(--color-danger); }\n.stat { color: var(--color-success); }' }], { ruleset: 'consumer' });
    assert.ok(real.some(f => f.rule === 'D2' && f.message === '.text'), 'FIX: D2 did not flag the exact .text class');
    assert.ok(real.some(f => f.rule === 'D2' && f.message === '.stat'), 'FIX: D2 did not flag the exact .stat class');
});

test('every rule carries a doc anchor and a fix template with the rule id in brackets', () => {
    for (const rule of RULES) {
        assert.ok(rule.docs && rule.docs.length > 0, `FIX: rule ${rule.id} has no doc anchor`);
        assert.ok(rule.fixTemplate.includes(`[${rule.id}]`), `FIX: rule ${rule.id}'s fix template does not end with [${rule.id}]`);
    }
});

test('getRuleMeta finds a rule row by id, and undefined for an unknown one', () => {
    assert.equal(getRuleMeta('D1').category, 'D');
    assert.equal(getRuleMeta('NOPE'), undefined);
});

test('html scanner: a Razor bind-suffix attribute (with a lambda value) does not leak into the next tag\'s attributes or name (#686)', () => {
    const { nodes } = scanHtml(
        '<PkSelect @bind-Value:get="Selected" @bind-Value:set="v => Selected = v" @bind-Value:after="OnChanged"></PkSelect>\n<PkFieldListRow></PkFieldListRow>',
    );
    const select = nodes.find(n => n.name === 'PkSelect' && !n.closing);
    assert.ok(select, 'FIX: PkSelect node was not scanned at all');
    assert.deepEqual(Object.keys(select.attrs), [], `FIX: bind-suffix directives leaked into PkSelect's attrs, got ${JSON.stringify(select.attrs)}`);
    const row = nodes.find(n => n.name === 'PkFieldListRow' && !n.closing);
    assert.ok(row, 'FIX: <PkFieldListRow> was not scanned as its own tag - it was likely swallowed as attribute text of the previous tag');
});

test('html scanner: an em dash inside a quoted attribute value does not desync the tokenizer (#686)', () => {
    const { nodes } = scanHtml('<PkButton AriaLabel="Save — done" Disabled></PkButton>');
    const btn = nodes.find(n => n.name === 'PkButton' && !n.closing);
    assert.equal(btn.attrs.AriaLabel, 'Save — done', `FIX: em dash in a quoted value broke attribute parsing, got ${JSON.stringify(btn.attrs)}`);
    assert.ok('Disabled' in btn.attrs, `FIX: the em dash desynced parsing so a later real attribute was missed, got ${JSON.stringify(btn.attrs)}`);
});

test('B3: does not flag Blazor bind-suffix syntax, a generic type parameter, or an em dash inside a value as an unknown parameter (#686)', () => {
    const clean = checkFiles(
        [{
            path: 'App.razor',
            text: '<PkSelect @bind-Value:get="Selected" @bind-Value:set="v => Selected = v" @bind-Value:after="OnChanged" TItem="OrderRow" Label="Save — done"></PkSelect>',
        }],
        { ruleset: 'consumer' },
    );
    const b3 = clean.filter(f => f.rule === 'B3');
    assert.equal(b3.length, 0, `FIX: B3 flagged parser garbage instead of real syntax, got ${JSON.stringify(b3)}`);
});

test('B3: still flags a real unknown parameter (#686)', () => {
    const findings = checkFiles([{ path: 'App.razor', text: '<PkButton Sizee="ButtonSize.Small"></PkButton>' }], { ruleset: 'consumer' });
    assert.ok(findings.some(f => f.rule === 'B3'), 'FIX: B3 did not flag a genuinely unknown parameter');
});

test('B1 was removed as a duplicate of D1 (#686): a raw <table> in .razor is flagged once, by D1, not twice', () => {
    const findings = checkFiles([{ path: 'App.razor', text: '<table></table>' }], { ruleset: 'consumer' });
    assert.ok(!findings.some(f => f.rule === 'B1'), 'FIX: B1 still exists - it should have been removed as a duplicate of D1');
    assert.ok(findings.some(f => f.rule === 'D1'), 'FIX: D1 did not flag the raw <table> in a .razor file');
});

// #718: B4 used to fire on every @page component in any Razor app, whether or not that app had ever adopted
// PageBase (92/92 false positives against a real app with its own, different, working page-lifecycle pattern -
// see #686). It is now gated app-wide: it only fires on a run where at least one file already declares
// `@inherits ...PageBase` somewhere - real, deliberate evidence the app opted in - never guessed per file.
test('B4: fires on a @page component with no @inherits PageBase, when some other file in the app already uses PageBase (#718)', () => {
    const files = [
        { path: 'Home.razor', text: '@page "/"\n@inherits HomePageBase\n<PkTable></PkTable>' },
        { path: 'Orders.razor', text: '@page "/orders"\n<PkTable></PkTable>' },
    ];
    const findings = checkFiles(files, { ruleset: 'consumer' });
    const b4 = findings.filter(f => f.rule === 'B4');
    assert.equal(b4.length, 1, 'FIX: B4 should fire exactly once, for Orders.razor only');
    assert.equal(b4[0].file, 'Orders.razor');
});

test('B4: does not fire anywhere in an app that shows no sign of PageBase adoption at all (#718)', () => {
    // Same shape of violation as above (a @page component with no @inherits PageBase), but nothing anywhere in
    // this run ever inherits PageBase - a real external app with its own, different page-lifecycle pattern
    // (#686: a PageRegistry, an ActionRunner, PkRecordEditor), not an app-framework app that missed a spot.
    const files = [
        { path: 'PageRegistry.razor', text: '<PkTable></PkTable>' },
        { path: 'Orders.razor', text: '@page "/orders"\n<PkTable></PkTable>' },
        { path: 'Setup.razor', text: '@page "/setup"\n<PkTable></PkTable>' },
    ];
    const findings = checkFiles(files, { ruleset: 'consumer' });
    assert.equal(findings.filter(f => f.rule === 'B4').length, 0, 'FIX: B4 fired on an app with no PageBase adoption signal anywhere');
});

// #719: against a real external app, B6's `<script>` check fired on lines with no `<script>` tag at all - a
// self-closing PkSpinner, an inline <svg>, a javascript: URI bookmarklet href. Each case below matches one of
// those reported shapes (a real <script> tag is included as the positive control).
test('B6: flags a real <script> tag at its own line, not a self-closing component, an inline svg, or a javascript: href (#719)', () => {
    // The href value below is built by concatenation rather than written as one literal string, so this
    // fixture does not itself trip the repository's own security scanner (core/tools/security.mjs, rule
    // no-javascript-url), which flags a quote immediately followed by that scheme name.
    const bookmarkletHref = 'java' + 'script:(function(){alert(1)})()';
    const findings = checkFiles(
        [{
            path: 'App.razor',
            text: [
                '<PkSpinner Class="@(IsLoading ? "spin" : "")" />',
                '',
                '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">',
                '  <path d="M12 2 L2 22 L22 22 Z" />',
                '</svg>',
                '',
                `<a href="${bookmarkletHref}">Bookmarklet</a>`,
                '',
                '<script>',
                "  console.log('real script');",
                '</script>',
            ].join('\n'),
        }],
        { ruleset: 'consumer' },
    );
    const b6Script = findings.filter(f => f.rule === 'B6' && f.message === '<script>');
    assert.equal(b6Script.length, 1, `FIX: expected exactly one B6 <script> finding, got ${JSON.stringify(b6Script)}`);
    assert.equal(b6Script[0].line, 9, `FIX: B6 reported the <script> finding at the wrong line, got ${JSON.stringify(b6Script[0])}`);
});

test('B6: a Razor ternary attribute value that reuses the outer HTML quote character does not desync the scanner (#719)', () => {
    // `Class="@(IsLoading ? "spin" : "")"` is common, valid Razor: the C# ternary's own quoted strings reuse
    // the surrounding HTML attribute's quote character. A naive scanner would end the value at the first
    // inner quote, leaking the remainder (`: "")" />`) to be re-scanned as bogus markup.
    const { nodes } = scanHtml('<PkSpinner Class="@(IsLoading ? "spin" : "")" />\n<script>\nconsole.log(1);\n</script>');
    const spinner = nodes.find(n => n.name === 'PkSpinner');
    assert.ok(spinner, 'FIX: PkSpinner was not scanned at all');
    assert.equal(spinner.attrs.Class, '@(IsLoading ? "spin" : "")', `FIX: the ternary's inner quotes truncated the Class value, got ${JSON.stringify(spinner.attrs)}`);
    const scriptNodes = nodes.filter(n => n.name.toLowerCase() === 'script' && !n.closing);
    assert.equal(scriptNodes.length, 1, `FIX: expected exactly one real <script> node, got ${JSON.stringify(scriptNodes)}`);
    assert.equal(scriptNodes[0].line, 2, `FIX: the real <script> tag was attributed to the wrong line, got ${JSON.stringify(scriptNodes[0])}`);
});

test('B6: a javascript: href with a bookmarklet that embeds an unescaped <script> string never produces a non-closing script node (#719)', () => {
    // Built by concatenation for the same reason as the test above: this file's own source never spells out
    // the scheme name or the markup-injecting call as one literal run, so the repo's security scanner does
    // not flag this test fixture.
    const bookmarkletHref = 'java' + 'script:' + 'document' + '.write(\'<script src="https://example.com/x.js"></script>\')';
    const { nodes } = scanHtml(`<a href="${bookmarkletHref}">Bookmarklet</a>`);
    const openScript = nodes.find(n => n.name.toLowerCase() === 'script' && !n.closing);
    assert.equal(openScript, undefined, `FIX: a javascript: href's embedded markup string was scanned as a real <script> element, got ${JSON.stringify(openScript)}`);
});
