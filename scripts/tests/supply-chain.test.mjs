// Supply-chain and repository hygiene checks from the security audit (issue #106): dependency advisories, workflow pins and permissions,
// Dependabot, the security policy, reproducible package builds. Text checks only (there is no YAML parser in this repository).
// Run: node --test scripts/tests/supply-chain.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');

test('NuGet audit: no advisory is suppressed, and AngleSharp (bunit\'s parser) is pinned at a release that fixes GHSA-pgww-w46g-26qg (1.5.0)', () => {
    const projects = ['Directory.Build.props', 'Directory.Packages.props', 'blazor/src/PlainKit.Blazor/PlainKit.Blazor.csproj', 'blazor/tests/PlainKit.Blazor.Tests/PlainKit.Blazor.Tests.csproj', 'blazor/samples/PlainKit.Playground/PlainKit.Playground.csproj'];
    for (const p of projects) assert.doesNotMatch(read(p), /NuGetAuditSuppress|<NoWarn>[^<]*NU190/, `${p} suppresses a NuGet audit advisory: update the package instead`);
    const pin = /<PackageVersion Include="AngleSharp" Version="(\d+)\.(\d+)\./.exec(read('Directory.Packages.props'));
    assert.ok(pin, 'AngleSharp is pinned');
    assert.ok(Number(pin[1]) > 1 || Number(pin[2]) >= 5, `AngleSharp ${pin[1]}.${pin[2]} is older than 1.5.0`);
});

const workflows = fs.readdirSync(path.join(root, '.github', 'workflows')).filter(f => /\.ya?ml$/.test(f));
const workflow = f => read(`.github/workflows/${f}`);

test('every action outside actions/* and github/* is pinned to a full commit SHA with its version in a comment', () => {
    const problems = [];
    for (const f of workflows) for (const [n, line] of workflow(f).split('\n').entries()) {
        const m = /^\s*(?:-\s*)?uses:\s*([^\s#]+)(.*)$/.exec(line);
        if (!m || m[1].startsWith('./')) continue;
        const [name] = m[1].split('@');
        if (/^(actions|github)\//.test(name)) continue; // first-party: pinned by tag, Dependabot keeps them current
        if (!/@[0-9a-f]{40}$/.test(m[1]) || !/#\s*v?\d/.test(m[2])) problems.push(`${f}:${n + 1} ${m[1]}`);
    }
    assert.deepEqual(problems, [], 'pin third-party actions to a commit SHA and say the version in a comment, or use the gh CLI in a step');
});

test('no workflow splices a ${{ }} expression into a run script (script injection); values go through env', () => {
    const problems = [];
    for (const f of workflows) {
        const lines = workflow(f).split('\n');
        for (let i = 0; i < lines.length; i++) {
            const m = /^(\s*)(?:-\s*)?run:\s*(.*)$/.exec(lines[i]);
            if (!m) continue;
            const body = [m[2]];
            if (/^[|>][-+]?$/.test(m[2])) for (let j = i + 1; j < lines.length && (lines[j].trim() === '' || lines[j].search(/\S/) > m[1].length); j++) body.push(lines[j]);
            if (body.some(l => l.includes('${{'))) problems.push(`${f}:${i + 1}`);
        }
    }
    assert.deepEqual(problems, []);
});

test('no workflow runs on pull_request_target or workflow_run (they run with secrets on code from a fork)', () => {
    for (const f of workflows) assert.doesNotMatch(workflow(f), /^\s*(pull_request_target|workflow_run)\s*:/m, f);
});

test('the summary job that writes to pull requests runs the reporting script from the BASE branch, not from the pull request', () => {
    const ci = workflow('ci.yml');
    const job = /^  ci-summary:\n([\s\S]*)$/m.exec(ci)?.[1];
    assert.ok(job, 'ci.yml has a ci-summary job');
    assert.match(job, /pull-requests: write/);
    const checkout = /uses: actions\/checkout@v4\n((?:\s+.*\n)+?)\s*\n/.exec(job)?.[1] ?? '';
    assert.match(checkout, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/, 'the checkout is the base commit');
    assert.match(checkout, /sparse-checkout: scripts/);
    assert.match(checkout, /persist-credentials: false/);
    assert.doesNotMatch(job, /head\.(sha|ref)|github\.head_ref|refs\/pull\//, 'the job never names the pull request head');
});

test('only the summary job may write to pull requests; every other permission in ci.yml is read', () => {
    const writes = [...workflow('ci.yml').matchAll(/^\s*([\w-]+): write$/gm)].map(m => m[1]);
    assert.deepEqual(writes, ['pull-requests']);
});

test('the release workflow uses only GitHub\'s own actions and the pinned NuGet login, and passes the NuGet key through env', () => {
    const release = workflow('release.yml');
    const used = [...release.matchAll(/uses:\s*([^\s#]+)/g)].map(m => m[1].split('@')[0]);
    assert.deepEqual([...new Set(used)].filter(u => !/^actions\//.test(u)), ['NuGet/login']);
    assert.doesNotMatch(release, /--api-key "\$\{\{/);
    assert.match(release, /NUGET_API_KEY: \$\{\{ steps\.nuget-login\.outputs\.NUGET_API_KEY \}\}/);
    assert.match(release, /tags: \['v\*'\]/);
});

test('Dependabot watches the GitHub Actions and the NuGet packages', () => {
    const d = read('.github/dependabot.yml');
    assert.match(d, /package-ecosystem: github-actions\n\s+directory: \//);
    assert.match(d, /package-ecosystem: nuget\n\s+directory: \//);
    assert.doesNotMatch(d, /package-ecosystem: npm/, 'core has no npm dependencies');
});

test('SECURITY.md says how to report, which versions are supported and what is in scope', () => {
    const s = read('SECURITY.md');
    for (const heading of ['## Reporting a vulnerability', '## Supported versions', '## Scope']) assert.ok(s.includes(heading), heading);
    assert.match(s, /security\/advisories\/new/);
    assert.match(s, /latest release/);
});

test('the code scanning workflow is optional: scheduled or manual only, never on pull requests, first-party actions, and not a required check', () => {
    const c = workflow('codeql.yml');
    assert.match(c, /^on:\n  schedule:[\s\S]*workflow_dispatch:/m);
    assert.doesNotMatch(c, /^\s*(pull_request|push)\s*:/m);
    assert.deepEqual([...new Set([...c.matchAll(/uses:\s*([^\s@]+)/g)].map(m => m[1]))].sort(), ['actions/checkout', 'actions/setup-node', 'github/codeql-action/analyze', 'github/codeql-action/init']);
    assert.match(c, /javascript-typescript, csharp/);
    assert.match(c, /security-events: write/);
    assert.ok(!/CodeQL/i.test(read('.github/REPO-SETTINGS.md').split('"checks"')[1]?.split(']')[0] ?? ''), 'CodeQL is not in the required checks list');
});
