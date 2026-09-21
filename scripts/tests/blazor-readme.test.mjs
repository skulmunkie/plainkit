// The consumer-facing text of PlainKit.Blazor: the READMEs and the skills (source and generated) must not hard-code a release version
// (a README ships inside the package, so a number in it is wrong one release later), and the parameters the package README names in its
// "most-used parameters" table must exist on the components.
import '../../core/tests/needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { collect, generate, root } from '../build-skills.mjs';

const read = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const version = read('core/VERSION').trim();
const SEMVER = /\b\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?\b/g;
const versionsIn = text => [...text.replace(/(\d)\.(zip|nupkg|md)\b/g, '$1 .$2').matchAll(SEMVER)].map(m => m[0]);

const walk = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name).replace(/\\/g, '/')]);

/** Every text a consumer reads (CHANGELOG.md is the one place a historical version belongs, and is not listed). */
function consumerTexts() {
    const texts = new Map();
    for (const f of ['README.md', 'core/README.md', 'blazor/src/PlainKit.Blazor/README.md', ...walk('scripts/skills').filter(f => f.endsWith('.md'))]) texts.set(f, read(f));
    for (const [f, text] of generate(collect())) texts.set('generated skills/' + f, text);
    return texts;
}

test('no README or skill text hard-codes a version other than the current one (core/VERSION)', () => {
    const problems = [];
    for (const [file, text] of consumerTexts()) {
        for (const v of versionsIn(text)) if (v !== version) problems.push(`${file}: ${v}`);
    }
    assert.deepEqual(problems, [], `use "<version>", "latest" or the release list instead of a release number (core/VERSION is ${version}); history belongs in CHANGELOG.md`);
});

test('the package README is for consumers: no contributor-only build steps', () => {
    const text = read('blazor/src/PlainKit.Blazor/README.md');
    assert.doesNotMatch(text, /Building this repository/, 'building the repository belongs in CONTRIBUTING.md');
    assert.doesNotMatch(text, /generated\.manifest\.json/, 'the generator manifest is not in the package or in git: point at references/known-gaps.md');
});

test('the parameters named in the README table of most-used parameters exist on the components', () => {
    const readme = read('blazor/src/PlainKit.Blazor/README.md');
    const section = /### The skills, the references and the most-used parameters\n([\s\S]*?)\n#{2,3} /.exec(readme);
    assert.ok(section, 'the README has the section "The skills, the references and the most-used parameters"');
    const rows = section[1].split('\n').filter(l => /^\| `Pk\w+` \|/.test(l));
    assert.ok(rows.length >= 6, 'the table lists PkCard, PkEmptyState, PkStat, PkAlert, PkTooltip and PkMenuItem');
    const razor = collect().razor;
    const problems = [];
    for (const row of rows) {
        const [, comp, params] = /^\| `(Pk\w+)` \| (.*) \|$/.exec(row);
        if (!razor[comp]) { problems.push(`unknown component ${comp}`); continue; }
        const names = new Set(razor[comp].params.map(p => p.name));
        // the backticked words that come first in each comma-separated entry are parameters; a parenthesis holds prose or a type
        for (const entry of params.split(/,(?![^(]*\))/)) {
            const name = /^\s*`(\w+)`/.exec(entry)?.[1];
            if (!names.has(name)) problems.push(`${comp} has no parameter ${name}`);
        }
    }
    assert.deepEqual(problems, []);
});

test('the skills and the README say to write TItem for a method-group handler, and the Razor compile check exists', () => {
    const readme = read('blazor/src/PlainKit.Blazor/README.md');
    const skill = read('scripts/skills/plainkit-blazor/SKILL.md');
    assert.match(readme, /<PkTable TItem="Order"/);
    assert.match(skill, /<PkTable TItem="Order"/);
    assert.match(readme, /`<ChildContent>`/, 'the README says a named slot needs an explicit ChildContent');
    assert.ok(fs.existsSync(path.join(root, 'blazor/tests/PlainKit.Blazor.Tests/TableTypeInference.razor')), 'the documented form is compiled in blazor/tests');
});
