// Headless subset of the scorecard: node core/site/scorecard/static-audit.mjs
// Measures what needs no browser (stylesheet and script size, literal colours and sizes, text-pair contrast), scores it with the
// same definitions as the scorecard page, and prints the result. Exits 1 when the static score is below --min (default 0).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { staticMetrics } from '../../js/audit.js';
import { scoreAll } from '../../js/scoring.js';
import { SCORING, TEXT_PAIRS, EXCEPTIONS, PRIMARY_CSS } from './scoring.data.js';

const sdkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// The files a module pulls in through static import/export-from, transitively (relative specifiers only).
function baseClosure(root, entry) {
    const seen = new Set(); const queue = [entry];
    while (queue.length) {
        const f = queue.pop(); if (seen.has(f) || !fs.existsSync(path.join(root, f))) continue; seen.add(f);
        const src = fs.readFileSync(path.join(root, f), 'utf8');
        for (const m of src.matchAll(/(?:import|export)\s[^'"]*?from\s+['"](\.[^'"]+)['"]|import\s+['"](\.[^'"]+)['"]/g))
            queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1] ?? m[2])));
    }
    return [...seen];
}

export function readPlainkit(root = sdkRoot) {
    const walk = d => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : []);
    const rel = f => path.relative(root, f).split(path.sep).join('/');
    const text = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
    const elementFiles = walk(path.join(root, 'elements')).map(rel);
    const names = [...PRIMARY_CSS, ...elementFiles.filter(f => f.endsWith('.css') && !f.endsWith('elements.css'))];
    const cssFiles = Object.fromEntries(names.map(n => [n, text(path.join(root, n))]));
    // Script weight is what EVERY page loads: the closure of js/plainkit.js. Elements and their behaviour modules load on demand and
    // are held to per-element budgets by tests/budgets.test.mjs, so counting them here would punish a bigger component set.
    const jsNames = baseClosure(root, 'js/plainkit.js');
    const jsFiles = Object.fromEntries(jsNames.map(f => [f, text(path.join(root, f))]));
    return { cssFiles, jsFiles, tokensCss: cssFiles['tokens/tokens.css'] };
}

export function runStaticAudit(root = sdkRoot) {
    const metrics = staticMetrics({ ...readPlainkit(root), pairs: TEXT_PAIRS });
    const measured = { cssKb: metrics.cssKb, jsKb: metrics.jsKb, literalColours: metrics.literalColours, literalSizes: metrics.literalSizes, contrastFail: metrics.contrastFail };
    return { metrics, measured, scores: scoreAll(SCORING, measured) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const { metrics, scores } = runStaticAudit();
    console.log(`CSS ${metrics.cssKb} KB, JS ${metrics.jsKb} KB, literal colours ${metrics.literalColours}, literal size share ${metrics.literalSizes}, failing text pairs ${metrics.contrastFail}`);
    for (const [key, c] of Object.entries(scores.categories)) console.log(`${c.label.padEnd(14)} ${c.score ?? 'n/a'}`);
    console.log(`Static overall ${scores.overall}`);
    if (process.argv.includes('--write')) {
        const scoresOnly = Object.fromEntries(Object.entries(scores.categories).map(([k, c]) => [k, c.score]));
        fs.writeFileSync(path.join(sdkRoot, 'site', 'scorecard', 'baseline.json'), JSON.stringify({ note: 'Static scores only go up: the test fails when one drops. Refresh with node site/scorecard/static-audit.mjs --write after an improvement.', overall: scores.overall, categories: scoresOnly }, null, 2) + '\n');
        fs.writeFileSync(path.join(sdkRoot, 'site', 'scorecard', 'report.json'), JSON.stringify({ generated: new Date().toISOString(), metrics: { ...metrics, perFile: undefined }, perFile: metrics.perFile.map(f => ({ name: f.name, bytes: f.bytes, rules: f.rules, literalColours: f.literalColours, literalSizes: f.literalSizes })), scores: { overall: scores.overall, categories: scoresOnly }, exceptions: EXCEPTIONS }, null, 2) + '\n');
    }
    const min = Number(process.argv[process.argv.indexOf('--min') + 1]) || 0;
    if (scores.overall !== null && scores.overall < min) process.exit(1);
}
