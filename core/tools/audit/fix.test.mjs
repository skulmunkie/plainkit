// Tests for the opt-in --fix candidates (design 5.4, #1519): the pure edits in fix.mjs and the CLI wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fixD1Simple, fixA1Label, applyFixes, updateAllowText, formatDiff } from './fix.mjs';
import { run, parseArgs } from './cli.mjs';
import { makeTempDir } from '../tempdir.mjs';

function capture() {
    const out = [];
    const err = [];
    return { out, err, stdout: (...a) => out.push(a.join(' ')), stderr: (...a) => err.push(a.join(' ')) };
}

test('D1-simple: <hr> and an empty <progress value max> become pk-divider and pk-progress', () => {
    const r = fixD1Simple('<hr>\n<hr />\n<progress value="3" max=\'10\'></progress>');
    assert.equal(r.text, '<pk-divider></pk-divider>\n<pk-divider></pk-divider>\n<pk-progress value="3" max=\'10\'></pk-progress>');
    assert.equal(r.count, 3);
});

test('D1-simple: leaves a tag with a class, style, other attribute, expression or fallback content alone', () => {
    const source = [
        '<hr class="x">', '<hr style="y">', '<progress value="3" id="p"></progress>',
        '<progress value="@v" max="10"></progress>', '<progress value="3">30%</progress>',
    ].join('\n');
    assert.deepEqual(fixD1Simple(source), { text: source, count: 0 });
});

test('D1-simple: a plainkit-audit-ignore comment on the line or the line before protects the tag', () => {
    const source = '<!-- plainkit-audit-ignore D1 -- keep -->\n<hr>\n<br>\n<hr>';
    const r = fixD1Simple(source);
    assert.equal(r.text, '<!-- plainkit-audit-ignore D1 -- keep -->\n<hr>\n<br>\n<pk-divider></pk-divider>');
    assert.equal(r.count, 1);
});

test('D1-simple and A1-label: nothing inside an ignore-start/ignore-end block is rewritten, LF or CRLF (#1518)', () => {
    for (const eol of ['\n', '\r\n']) {
        const source = ['<!-- plainkit-audit-ignore-start D1,A1 -- keep -->', '<br>', '<hr>', '<pk-button icon title="Go"></pk-button>', '<!-- plainkit-audit-ignore-end -->', '<br>', '<br>', '<hr>', '<pk-button icon title="Go"></pk-button>'].join(eol);
        const r = fixD1Simple(source);
        assert.equal(r.count, 1);
        assert.ok(r.text.includes(`<br>${eol}<hr>${eol}<pk-button`));
        assert.ok(r.text.endsWith(`<pk-divider></pk-divider>${eol}<pk-button icon title="Go"></pk-button>`));
        const a = fixA1Label(source);
        assert.equal(a.count, 1);
        assert.ok(a.text.includes(`<hr>${eol}<pk-button icon title="Go">`));
        assert.ok(a.text.endsWith('<pk-button label="Go" icon title="Go"></pk-button>'));
    }
});

test('A1-label: an icon-only pk-button with a static title gains label, keeping the title', () => {
    const r = fixA1Label('<pk-button icon="x" title="Close"></pk-button>\n<pk-button icon title=\'Open\'> </pk-button>');
    assert.equal(r.text, '<pk-button label="Close" icon="x" title="Close"></pk-button>\n<pk-button label=\'Open\' icon title=\'Open\'> </pk-button>');
    assert.equal(r.count, 2);
});

test('A1-label: skips a button with a name, text, no icon, no title or a dynamic title', () => {
    const source = [
        '<pk-button icon="x" title="T" label="L"></pk-button>', '<pk-button icon="x" title="T">Go</pk-button>',
        '<pk-button title="T"></pk-button>', '<pk-button icon="x"></pk-button>', '<pk-button icon="x" title="@t"></pk-button>',
    ].join('\n');
    assert.deepEqual(fixA1Label(source), { text: source, count: 0 });
});

test('applyFixes is idempotent', () => {
    const once = applyFixes('<hr><pk-button icon title="A"></pk-button>', ['D1-simple', 'A1-label']);
    assert.deepEqual(once.counts, { 'D1-simple': 1, 'A1-label': 1 });
    assert.deepEqual(applyFixes(once.text, ['D1-simple', 'A1-label']).counts, { 'D1-simple': 0, 'A1-label': 0 });
});

test('updateAllowText removes a dead entry, lowers a stale count, keeps indent and CRLF', () => {
    const entry = (rule, count) => ({ rule, path: 'a.html', reason: 'a reason of enough length', issue: 1, count });
    const text = JSON.stringify({ strict: true, allow: [entry('D1', 3), entry('A1', 2), entry('S1', 1)] }, null, 4).replace(/\n/g, '\r\n');
    const report = [
        { rule: 'D1', path: 'a.html', status: 'stale', actual: 1 },
        { rule: 'A1', path: 'a.html', status: 'dead', actual: 0 },
        { rule: 'S1', path: 'a.html', status: 'ok', actual: 1 },
    ];
    const r = updateAllowText(text, report);
    assert.equal(r.removed, 1);
    assert.equal(r.lowered, 1);
    assert.ok(r.text.includes('\r\n    "strict"'));
    const json = JSON.parse(r.text);
    assert.deepEqual(json.allow.map(e => [e.rule, e.count]), [['D1', 1], ['S1', 1]]);
});

test('formatDiff shows only the changed lines with context', () => {
    const diff = formatDiff('a.html', 'one\ntwo\nthree\nfour', 'one\nTWO\nthree\nfour');
    assert.equal(diff, '--- a.html\n+++ a.html\n@@ line 1 @@\n one\n-two\n+TWO\n three\n four');
});

test('parseArgs: --fix needs known ids and --dry-run needs something to preview', () => {
    assert.deepEqual(parseArgs(['--fix', 'D1-simple,A1-label']).opts.fix, ['D1-simple', 'A1-label']);
    assert.equal(parseArgs(['--fix', 'bogus']).errors.length, 1);
    assert.equal(parseArgs(['--dry-run']).errors.length, 1);
    assert.equal(parseArgs(['--update-allow', '--dry-run']).errors.length, 0);
});

test('CLI: --fix --dry-run prints a diff and writes nothing; --fix writes; a second run changes nothing', async () => {
    const dir = makeTempDir('plainkit-audit-');
    const file = path.join(dir, 'index.html');
    const source = '<main>\n<hr>\n<pk-button icon="x" title="Close"></pk-button>\n</main>\n';
    fs.writeFileSync(file, source);

    let c = capture();
    assert.equal(await run(['--fix', 'D1-simple,A1-label', '--dry-run'], { cwd: dir, ...c }), 0);
    assert.equal(fs.readFileSync(file, 'utf8'), source);
    const shown = c.out.join('\n');
    assert.ok(shown.includes('\n-<hr>') && shown.includes('\n+<pk-divider>'));
    assert.ok(c.out.some(l => l.includes('would change index.html')));

    c = capture();
    assert.equal(await run(['--fix', 'D1-simple,A1-label'], { cwd: dir, ...c }), 0);
    assert.equal(fs.readFileSync(file, 'utf8'), '<main>\n<pk-divider></pk-divider>\n<pk-button label="Close" icon="x" title="Close"></pk-button>\n</main>\n');

    c = capture();
    assert.equal(await run(['--fix', 'D1-simple,A1-label'], { cwd: dir, ...c }), 0);
    assert.deepEqual(c.out, []);
});

test('CLI: --update-allow removes a dead allow entry from plainkit.audit.json (and --dry-run does not)', async () => {
    const dir = makeTempDir('plainkit-audit-');
    fs.writeFileSync(path.join(dir, 'index.html'), '<main></main>\n');
    const config = path.join(dir, 'plainkit.audit.json');
    const body = JSON.stringify({ allow: [{ rule: 'D1', path: 'index.html', reason: 'a reason of enough length', issue: 1, count: 1 }] }, null, 2) + '\n';
    fs.writeFileSync(config, body);

    assert.equal(await run(['--update-allow', '--dry-run'], { cwd: dir, ...capture() }), 0);
    assert.equal(fs.readFileSync(config, 'utf8'), body);

    const c = capture();
    assert.equal(await run(['--update-allow'], { cwd: dir, ...c }), 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(config, 'utf8')).allow, []);
    assert.ok(c.out.some(l => l.includes('1 dead allow entry removed')));
});
