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
