// #2061: the packed analyzer must not reference a Microsoft.CodeAnalysis newer than the one its project declares (0.33.0 shipped 5.12 and failed to load on SDK 10.0.400, compiler 5.9).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAnalyzerRefs, declaredRoslynMax } from '../check-package.mjs';
import { readAssemblyRefs } from '../assembly-refs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const csproj = fs.readFileSync(path.join(root, 'blazor/src/PlainKit.Blazor.Analyzers/PlainKit.Blazor.Analyzers.csproj'), 'utf8');
const ref = (v) => [{ name: 'netstandard', version: '2.0.0.0' }, { name: 'Microsoft.CodeAnalysis', version: v }, { name: 'Microsoft.CodeAnalysis.CSharp', version: v }];

test('the analyzer project declares a Roslyn floor below the compiler of the oldest supported SDK', () => {
    const max = declaredRoslynMax(csproj);
    assert.ok(max, 'VersionOverride for Microsoft.CodeAnalysis.CSharp is missing');
    assert.ok(Number(max.split('.')[0]) < 5, `declared ${max}: the 5.x compilers are too new for older SDKs`);
});

test('a reference above the declared maximum is refused (the 5.12 regression)', () => {
    const p = checkAnalyzerRefs(ref('5.12.0.0'), '3.11.0');
    assert.equal(p.length, 2);
    assert.match(p[0], /Microsoft\.CodeAnalysis 5\.12\.0\.0.*above the declared maximum 3\.11\.0.*CS9057/);
});

test('references at or below the maximum pass; other assemblies are ignored', () => {
    assert.deepEqual(checkAnalyzerRefs(ref('3.11.0.0'), '3.11.0'), []);
    assert.deepEqual(checkAnalyzerRefs([{ name: 'System.Collections.Immutable', version: '10.0.0.0' }], '3.11.0'), []);
});

test('no declared maximum is a problem', () => assert.equal(checkAnalyzerRefs(ref('3.11.0.0'), undefined).length, 1));

test('the metadata reader sees the references of this very assembly build (skipped when not built)', { skip: !fs.existsSync(process.execPath) }, () => {
    const dll = path.join(root, 'blazor/src/PlainKit.Blazor.Analyzers/bin/Release/netstandard2.0/PlainKit.Blazor.Analyzers.dll');
    if (!fs.existsSync(dll)) return;
    const refs = readAssemblyRefs(fs.readFileSync(dll));
    assert.ok(refs.some(r => r.name === 'netstandard'));
    assert.deepEqual(checkAnalyzerRefs(refs, declaredRoslynMax(csproj)), []);
});
