// Import this first (import './needs-bootstrap.mjs') in a test that reads a generated file (core/dist, the element modules, Generated/, the skills, ...).
// Generated output is not in git: on a fresh clone, or after switching branches, run `node scripts/bootstrap.mjs`. Without it the test file fails here
// with that one instruction, instead of an ENOENT or a module-not-found deep inside the test.
// In the repository it checks every generated file (scripts/generated.mjs); in a copy of core/ alone (tests/carveout.test.mjs) only core's own output.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const core = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(core, '..');
const helper = path.join(repo, 'scripts', 'generated.mjs');

if (fs.existsSync(helper) && fs.existsSync(path.join(repo, 'blazor'))) {
    (await import(pathToFileURL(helper).href)).requireGenerated(repo);
} else {
    const missing = ['plainkit.css', 'dist/manifest.json'].filter(f => !fs.existsSync(path.join(core, f)));
    if (missing.length) throw new Error(`Generated files are missing: run node tools/build.mjs (missing ${missing[0]})`);
}
