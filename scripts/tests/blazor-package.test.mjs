// PlainKit.Blazor.csproj: the generator's manifest is a review aid, not package content. It must stay in the repository (generate-blazor.mjs --check
// compares it) but must not be packed (it would land in content/ and contentFiles/ and be copied into consumers' projects).
// A real `dotnet pack` is too slow for this suite; the manual check is in CONTRIBUTING.md.
// Run: node --test scripts/tests/*.test.mjs
import '../../core/tests/needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const csproj = fs.readFileSync(path.join(root, 'blazor', 'src', 'PlainKit.Blazor', 'PlainKit.Blazor.csproj'), 'utf8');
const manifest = 'Generated\\generated.manifest.json';

test('the generator manifest is not packed as content', () => {
    assert.ok(fs.existsSync(path.join(root, 'blazor', 'src', 'PlainKit.Blazor', 'Generated', 'generated.manifest.json')), 'the manifest exists');
    assert.ok(csproj.includes(`<Content Remove="${manifest}" />`), 'the SDK default Content item for the manifest is removed');
    assert.ok(csproj.includes(`<None Include="${manifest}" Pack="false" />`), 'the manifest stays in the project as a non-packed None item');
});

test('nothing else in the project is packed as content', () => {
    assert.ok(!/<Content\s+Include=/.test(csproj), 'no explicit Content Include items');
    assert.ok(!/PackagePath="[^"]*(content|contentFiles)/i.test(csproj), 'no PackagePath under content/ or contentFiles/');
});
