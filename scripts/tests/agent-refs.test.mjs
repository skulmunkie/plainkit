// core/dist/AGENTS.md and the llms.txt / llms-full.txt pair (scripts/build-agent-refs.mjs, issue #36): a format-neutral export of the same
// bundle scripts/build-skills.mjs builds, for developer agents that are not Claude Code. These tests do not re-check the content against the
// element API etc. (scripts/tests/skills.test.mjs already does, against the same collect()/generate()); they check the export itself: it is
// current on disk, deterministic, complete (every skill file is reachable) and every link it writes resolves to a real skill file.
import '../../core/tests/needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { collect, generate, crlf, SKILL_NAMES } from '../build-skills.mjs';
import { generateAll, diskFiles, differences, OUT_NAMES, root } from '../build-agent-refs.mjs';

const src = collect();
const bundle = generate(src);
const gen = generateAll(src);

test('core/dist/{AGENTS.md,llms.txt,llms-full.txt} on disk match the generator, byte for byte (CRLF); run node scripts/bootstrap.mjs when this fails', () => {
    assert.deepEqual(differences(gen), [], 'run node scripts/bootstrap.mjs');
});

test('the output is byte-deterministic', () => {
    const again = generateAll(collect());
    assert.deepEqual([...again.keys()], [...gen.keys()]);
    for (const [f, text] of gen) assert.equal(again.get(f), text, f);
});

test('exactly the three files, LF internally and CRLF on disk, as core/ requires', () => {
    assert.deepEqual([...gen.keys()].sort(), [...OUT_NAMES].sort());
    for (const [f, text] of gen) assert.ok(!text.includes('\r'), f);
    const disk = diskFiles();
    for (const [f, text] of disk) { assert.ok(text.includes('\r\n'), f); assert.ok(!/[^\r]\n/.test(text), `${f} has a bare LF`); assert.equal(text, crlf(gen.get(f)), f); }
});

test('every file carries the version of core/VERSION', () => {
    const version = fs.readFileSync(path.join(root, 'core', 'VERSION'), 'utf8').trim();
    for (const [f, text] of gen) assert.ok(text.includes(`Plainkit ${version}`), `${f} is not stamped with ${version}`);
});

test('node scripts/build-agent-refs.mjs --check passes on a current export', () => {
    const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'build-agent-refs.mjs'), '--check'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
});

test('differences() catches a stale copy (a temp directory, never the real core/dist: other tests read it concurrently)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-agent-refs-'));
    try {
        for (const [f, text] of gen) fs.writeFileSync(path.join(tmp, f), crlf(text));
        assert.deepEqual(differences(gen, tmp), [], 'a faithful copy has no differences');
        fs.writeFileSync(path.join(tmp, 'llms.txt'), 'stale\r\n');
        assert.deepEqual(differences(gen, tmp), ['changed: llms.txt']);
        fs.rmSync(path.join(tmp, 'AGENTS.md'));
        assert.deepEqual(differences(gen, tmp), ['changed: llms.txt', 'missing: AGENTS.md']);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('AGENTS.md embeds every skill file once, under a heading for its own path', () => {
    const agents = gen.get('AGENTS.md');
    for (const [f] of bundle) assert.ok(agents.includes(f.endsWith('SKILL.md') ? f.split('/')[0] : f.split('/').slice(1).join('/')), f);
});

test('AGENTS.md mentions every element tag and every Blazor component', () => {
    const agents = gen.get('AGENTS.md');
    for (const e of src.api) assert.ok(agents.includes(`\`${e.tag}\``), e.tag);
});

test('llms.txt is the short index: a title, a summary, and one link per skill file; every link resolves to a file the skills bundle has', () => {
    const txt = gen.get('llms.txt');
    assert.match(txt, /^# Plainkit\n/);
    assert.match(txt, /^> Plainkit /m);
    const links = [...txt.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1]).filter(u => u.startsWith('skills/'));
    assert.ok(links.length > 20);
    for (const link of links) assert.ok(bundle.has(link.slice('skills/'.length)), link);
    // one line per skill file, so the index is complete
    for (const [f] of bundle) assert.match(txt, new RegExp(`\\]\\(skills/${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`), f);
});

test('llms-full.txt is a flat concatenation: every skill file appears verbatim once, in skill order', () => {
    const full = gen.get('llms-full.txt');
    for (const skill of SKILL_NAMES) assert.ok(full.includes(`# ${skill}`), skill);
    for (const [f, text] of bundle) if (!f.endsWith('SKILL.md')) assert.ok(full.includes(text.trim()), f);
    const iSdk = full.indexOf('# plainkit-sdk'), iBlazor = full.indexOf('# plainkit-blazor');
    assert.ok(iSdk >= 0 && iBlazor > iSdk, 'plainkit-sdk comes before plainkit-blazor');
});

test('the SRI manifest lists AGENTS.md, llms.txt and llms-full.txt', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'core', 'dist', 'manifest.json'), 'utf8'));
    const listed = new Set(manifest.files.map(f => f.path));
    for (const name of OUT_NAMES) assert.ok(listed.has(name), `${name} is not in dist/manifest.json: run node scripts/build-agent-refs.mjs`);
});

test('no personal paths or real email addresses (core/tests/privacy.test.mjs also scans these, this is a focused check)', () => {
    for (const [f, text] of gen) {
        assert.doesNotMatch(text, /[A-Za-z]:[\\/]{1,4}Users[\\/]{1,4}[A-Za-z]|\/Users\/[a-z][\w.-]*\/|\/home\/[a-z][\w.-]*\//, f);
        for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g)) assert.match(m[0], /@(example\.(com|org|net)|localhost|plainkit\.invalid)$|^(name|user|you|me|hello|info|test)@/i, `${f}: ${m[0]}`);
    }
});
