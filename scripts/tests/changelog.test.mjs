// scripts/changelog.mjs: fragment parsing and checks, the pull request rule, the legacy classification, and compile in a temp directory.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseFragment, checkFragments, isDocsOnly, checkPr, classifyLegacy, splitBullets, compileChangelog, requiresCrlf, slugify, run, FRAGMENT_NAME } from '../changelog.mjs';

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'changelog.mjs');

test('parseFragment: front matter, first-line type, and every rejection', () => {
    assert.deepEqual(parseFragment('---\ntype: fixed\nissue: 12\n---\nA thing\nwrapped.\n'), { type: 'fixed', issue: '12', text: 'A thing wrapped.', errors: [] });
    assert.equal(parseFragment('type: added\nA new thing').type, 'added');
    assert.equal(parseFragment('---\r\ntype: notes\r\n---\r\nHi\r\n').text, 'Hi');
    assert.match(parseFragment('---\ntype: bogus\n---\nx').errors[0], /unknown type/);
    assert.match(parseFragment('just text').errors[0], /no type/);
    assert.match(parseFragment('---\ntype: fixed\n---\n\n').errors.join(), /empty/);
    assert.match(parseFragment('---\ntype: fixed\n---\none\n\ntwo').errors.join(), /one entry per file/);
    assert.match(parseFragment('---\ntype: fixed\n---\n- one\n- two').errors.join(), /one entry per file/);
    assert.match(parseFragment('---\ntype: fixed\nissue: x\n---\nA').errors.join(), /issue must be a number/);
    assert.match(parseFragment('---\ntype: fixed\nA').errors.join(), /not closed/);
});

test('checkFragments: names, stray files and folders', () => {
    const ok = '---\ntype: added\n---\nA';
    assert.deepEqual(checkFragments([{ name: '.gitkeep', text: '' }, { name: '12-a-thing.md', text: ok }, { name: '20260921101500-x.md', text: ok }]), []);
    const bad = checkFragments([{ name: 'notes.txt', text: 'x' }, { name: 'sub', text: null }, { name: '12-a.md', text: '' }, { name: 'README.md', text: ok }]);
    assert.equal(bad.length, 5, JSON.stringify(bad));
    assert.ok(bad.some(b => b.file === 'notes.txt') && bad.some(b => b.file === 'sub') && bad.some(b => b.file === 'README.md'));
    assert.ok(FRAGMENT_NAME.test('9-x.md') && !FRAGMENT_NAME.test('x-9.md') && !FRAGMENT_NAME.test('12-Bad.md'));
});

test('isDocsOnly / checkPr', () => {
    for (const p of ['README.md', 'core/README.md', '.github/pull_request_template.md', 'changelog/unreleased/1-a.md', 'changelog/README.md']) assert.ok(isDocsOnly(p), p);
    for (const p of ['core/elements/pk-tabs/pk-tabs.js', '.github/workflows/ci.yml', 'scripts/changelog.mjs']) assert.ok(!isDocsOnly(p), p);
    assert.ok(checkPr([{ status: 'M', path: 'CONTRIBUTING.md' }]).ok);
    assert.ok(!checkPr([{ status: 'M', path: 'core/js/log.js' }]).ok);
    assert.ok(checkPr([{ status: 'M', path: 'core/js/log.js' }], { PK_NO_CHANGELOG: '1' }).ok);
    assert.ok(checkPr([{ status: 'M', path: 'core/js/log.js' }, { status: 'A', path: 'changelog/unreleased/12-x.md' }]).ok);
    assert.ok(!checkPr([{ status: 'M', path: 'core/js/log.js' }, { status: 'M', path: 'changelog/unreleased/12-x.md' }]).ok, 'editing an old fragment does not count');
    assert.ok(!checkPr([{ status: 'M', path: 'core/js/log.js' }, { status: 'A', path: 'changelog/unreleased/.gitkeep' }]).ok);
});

test('classifyLegacy uses the prefixes of the 0.1.0-alpha.1 regrouping', () => {
    const c = classifyLegacy;
    assert.equal(c('- Added: x'), 'added');
    assert.equal(c('- Changed: x'), 'changed');
    assert.equal(c('- Fixed: x'), 'fixed');
    assert.equal(c('- Fixed (docs): x'), 'fixed');
    assert.equal(c('- Removed: x'), 'removed');
    assert.equal(c('- Changed (breaking): x'), 'breaking');
    assert.equal(c('- Removed (breaking): x'), 'breaking');
    assert.equal(c('- Alpha status of PlainKit.Blazor: verified'), 'notes');
    assert.equal(c('- Initial import of the toolkit.'), 'notes');
    assert.equal(c('- Added something with no colon'), 'notes');
});

test('splitBullets joins continuation lines and skips headings', () => {
    assert.deepEqual(splitBullets('\n### Added\n\n- Added: a\n  more\n- Fixed: b\n\n'), ['- Added: a more', '- Fixed: b']);
});

test('requiresCrlf reads .gitattributes', () => {
    const attrs = '* text=auto\ncore/** eol=crlf\nblazor/mappings/** eol=crlf\n*.png binary\n';
    assert.ok(requiresCrlf(attrs, 'core/x.js') && requiresCrlf(attrs, 'blazor/mappings/a.json'));
    assert.ok(!requiresCrlf(attrs, 'changelog/unreleased/1-a.md') && !requiresCrlf(attrs, 'CHANGELOG.md'));
    assert.equal(slugify('Fix the  Thing!'), 'fix-the-thing');
});

const CHANGELOG = `# Changelog

Intro.

## [Unreleased]

### Fixed

- Fixed: legacy fix.
- Changed (breaking): legacy break.

### Added

- Added: legacy add
  continued.
- A free note.

## [0.1.0] - 2026-01-01

### Added

- Added: old.
`;

test('compileChangelog merges legacy bullets and fragments, groups them, leaves an empty Unreleased and the old versions alone', () => {
    const out = compileChangelog(CHANGELOG, [
        { type: 'added', issue: '5', text: 'New thing' },
        { type: 'fixed', issue: null, text: 'Bug (#7)' },
        { type: 'removed', issue: '7', text: 'Gone' },
    ], '0.2.0', '2026-10-01');
    assert.equal(out, `# Changelog

Intro.

## [Unreleased]

## [0.2.0] - 2026-10-01

### Breaking

- Changed (breaking): legacy break.

### Added

- Added: legacy add continued.
- New thing (#5)

### Fixed

- Fixed: legacy fix.
- Bug (#7)

### Removed

- Gone (#7)

### Notes

- A free note.

## [0.1.0] - 2026-01-01

### Added

- Added: old.
`);
    assert.throws(() => compileChangelog(CHANGELOG, [], '0.1.0', '2026-10-01'), /already has/);
    assert.throws(() => compileChangelog(CHANGELOG, [], 'x', '2026-10-01'), /SemVer/);
    assert.throws(() => compileChangelog('# C\n\n## [Unreleased]\n\n## [0.1.0] - d\n', [], '0.2.0', '2026-10-01'), /nothing to release/);
});

function tmpRepo(changelog, crlf = false) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-changelog-'));
    fs.mkdirSync(path.join(root, 'changelog', 'unreleased'), { recursive: true });
    fs.writeFileSync(path.join(root, 'changelog', 'unreleased', '.gitkeep'), '');
    fs.writeFileSync(path.join(root, 'CHANGELOG.md'), crlf ? changelog.replace(/\n/g, '\r\n') : changelog);
    return root;
}

test('integration: new, check, compile in a temp directory (CRLF changelog stays CRLF)', () => {
    const root = tmpRepo(CHANGELOG, true);
    try {
        const now = new Date('2026-09-21T10:15:30Z');
        assert.equal(run(['new', 'fixed', 'Some Bug', '--issue', '42'], { root, now }).code, 0);
        assert.equal(run(['new', 'added', 'thing'], { root, now }).code, 0);
        assert.equal(run(['new', 'bogus', 'x'], { root, now }).code, 2);
        const dir = path.join(root, 'changelog', 'unreleased');
        assert.deepEqual(fs.readdirSync(dir).sort(), ['.gitkeep', '20260921101530-thing.md', '42-some-bug.md']);
        assert.equal(run(['new', 'fixed', 'Some Bug', '--issue', '42'], { root, now }).code, 1, 'no overwrite');
        assert.equal(run(['check'], { root }).code, 1, 'placeholder text is refused');
        fs.writeFileSync(path.join(dir, '42-some-bug.md'), '---\ntype: fixed\nissue: 42\n---\nThe bug is gone.\n');
        fs.writeFileSync(path.join(dir, '20260921101530-thing.md'), 'type: added\nA thing.\n');
        assert.equal(run(['check'], { root }).code, 0);
        fs.writeFileSync(path.join(dir, 'stray.txt'), 'x');
        assert.equal(run(['check'], { root }).code, 1);
        fs.unlinkSync(path.join(dir, 'stray.txt'));

        const r = run(['compile', '--version', '0.2.0', '--date', '2026-10-01'], { root });
        assert.equal(r.code, 0, r.err);
        assert.deepEqual(fs.readdirSync(dir), ['.gitkeep']);
        const raw = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
        assert.ok(raw.includes('\r\n') && !/[^\r]\n/.test(raw), 'CRLF kept');
        const text = raw.replace(/\r\n/g, '\n');
        assert.match(text, /## \[Unreleased\]\n\n## \[0\.2\.0\] - 2026-10-01\n\n### Breaking\n\n- Changed \(breaking\): legacy break\./);
        assert.match(text, /- A thing\.\n\n### Fixed\n\n- Fixed: legacy fix\.\n- The bug is gone\. \(#42\)\n/);
        assert.match(text, /## \[0\.1\.0\] - 2026-01-01/);
        assert.equal(run(['compile', '--version', '0.2.0'], { root }).code, 1, 'the version exists now');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('integration: check-pr against a git base, with and without the bypass', () => {
    const root = tmpRepo(CHANGELOG);
    const git = (...a) => { const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { cwd: root, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
    try {
        git('init', '-q', '-b', 'main'); git('add', '.'); git('commit', '-q', '-m', 'base');
        git('checkout', '-q', '-b', 'topic');
        fs.mkdirSync(path.join(root, 'core'), { recursive: true });
        fs.writeFileSync(path.join(root, 'core', 'a.js'), 'export {};\n');
        git('add', '.'); git('commit', '-q', '-m', 'code');
        assert.equal(run(['check-pr', '--base', 'main'], { root, env: {} }).code, 1);
        assert.equal(run(['check-pr', '--base', 'main'], { root, env: { PK_NO_CHANGELOG: '1' } }).code, 0);
        fs.writeFileSync(path.join(root, 'changelog', 'unreleased', '9-a.md'), 'type: added\nA.\n');
        git('add', '.'); git('commit', '-q', '-m', 'fragment');
        assert.equal(run(['check-pr', '--base', 'main'], { root, env: {} }).code, 0);
        assert.equal(run(['check-pr'], { root, env: {} }).code, 2);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the real repository fragments pass check (CLI)', () => {
    const r = spawnSync(process.execPath, [script, 'check'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
});
