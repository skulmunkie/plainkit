// Says whether the browser suite, UI review and Blazor browser runs of this checkout were made on the tree it has now (#1754), so an integration gate can assert
// "the browser result belongs to the final tree". Each of those scripts stamps its run (scripts/verify-guard.mjs).
// usage: node scripts/gate-check.mjs [--kinds browser,ui-review,blazor-browser]
// Exit 0 when every kind passed on this exact tree, 1 otherwise (missing, stale or failed), 2 for a bad argument.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAMP_KINDS, checkStamps, stampDir, treeId } from './verify-guard.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
let kinds = STAMP_KINDS;
for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--kinds' && argv[i + 1]) kinds = argv[++i].split(',');
    else { console.error(`usage: node scripts/gate-check.mjs [--kinds ${STAMP_KINDS.join(',')}]`); process.exit(2); }
}
const bad = kinds.filter(k => !STAMP_KINDS.includes(k));
if (bad.length) { console.error(`gate-check: unknown kind ${bad.join(', ')}`); process.exit(2); }
const current = treeId(root);
if (!current) { console.error('gate-check: not a git checkout'); process.exit(2); }
const r = checkStamps(kinds, current, { dir: stampDir(root) });
console.log(`gate-check: tree ${current}`);
for (const l of r.lines) console.log(l);
if (!r.ok) console.log('FIX: re-run the stale or missing suite on the final tree (node scripts/attest-browser.mjs, node scripts/ui-review.mjs, node scripts/blazor-browser.mjs), then run this again');
process.exit(r.ok ? 0 : 1);
