// Icon sprite build: node core/icons/build.mjs   (dependency-free, deterministic; part of node scripts/bootstrap.mjs, run before core/tools/build.mjs
// which copies the sprite it writes into core/dist/icons.svg)
//
// Reads every core/icons/src/<name>.svg (one bare <svg viewBox="0 0 24 24">...</svg> per file, the design language in core/icons/README.md), lints
// each one, and generates three files (never hand-edit them):
//   core/icons.svg          the sprite <pk-icon> and pk-button icon-name draw from (one <symbol id="<name>"> per source file)
//   core/icons/icons.json   { "names": [...] } sorted, the typed name list
//   core/icons/icons.d.ts   a TypeScript union type, PkIconName
//
// A Blazor PkIconName constants class is intentionally not generated here yet (see the README's "Source and tooling" TODO): a follow-up issue, not
// part of this build.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(root, 'src');
const repoRoot = path.resolve(root, '..', '..');

const NAME_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/; // kebab-case, no leading/trailing/double hyphen
const MAX_SOURCE_BYTES = 700; // a single icon's source .svg; generous for the busiest existing icon (settings, ~1.1KB grown from many paths, is the one exception grandfathered below)
export const SPRITE_BUDGET_BYTES = 16 * 1024; // core/icons.svg raw; see README.md "Size budget" - set once from the pre-phase-1 sprite size (7,746 bytes for 39 icons), never raised

// Icons already in the sprite before this build existed, kept as-is (verbatim) rather than redrawn to the 700-byte source guideline: settings' concentric
// cog path alone is long-hand SVG from the icon's original hand-authored form. New icons must fit the source budget; these do not restart it.
const GRANDFATHERED_SIZE = new Set(['settings']);

export function loadSources(dir = srcDir) {
    if (!fs.existsSync(dir)) throw new Error(`core/icons/build.mjs: no source folder at ${dir}`);
    return fs.readdirSync(dir).filter(f => f.endsWith('.svg')).sort() // filename order: deterministic, independent of the OS directory listing
        .map(f => ({ name: f.slice(0, -4), file: path.join(dir, f), text: fs.readFileSync(path.join(dir, f), 'utf8') }));
}

// Pure: one source file in, a list of problem strings out (empty = clean).
export function lintOne({ name, file, text }) {
    const problems = [];
    const rel = path.relative(repoRoot, file).replaceAll('\\', '/');
    if (!NAME_RE.test(name)) problems.push(`${rel}: "${name}" is not a kebab-case name (lowercase letters, digits, single hyphens)`);
    if (!/^<svg viewBox="0 0 24 24">[\s\S]*<\/svg>\s*$/.test(text.trim())) problems.push(`${rel}: must be exactly <svg viewBox="0 0 24 24">...</svg> (no width/height/xmlns/other attributes on the root)`);
    if (/\bfill="(?!none")[^"]*"/.test(text) || /\bstroke="(?!currentColor")[^"]*"/.test(text)) problems.push(`${rel}: no fill or stroke colour other than currentColor - the element applies stroke: currentColor; fill: none once`);
    if (/\bfill="none"/.test(text) || /\bstroke="currentColor"/.test(text)) problems.push(`${rel}: fill/stroke is applied once by elements/icon/icon.css - do not repeat it in the source`);
    if (/\bstyle="/i.test(text)) problems.push(`${rel}: no style attribute (CSP: no inline styles)`);
    if (/\bclass="/i.test(text)) problems.push(`${rel}: no class attribute`);
    if (/\bid="/i.test(text)) problems.push(`${rel}: no id attribute - the build assigns the symbol id from the filename`);
    if (/<script[\s>]/i.test(text) || /<style[\s>]/i.test(text)) problems.push(`${rel}: no <script> or <style> element`);
    if (/<!--/.test(text)) problems.push(`${rel}: no comments in a source icon`);
    const byteLen = Buffer.byteLength(text, 'utf8');
    if (byteLen > MAX_SOURCE_BYTES && !GRANDFATHERED_SIZE.has(name)) problems.push(`${rel}: ${byteLen} bytes, over the ${MAX_SOURCE_BYTES}-byte per-icon guideline - simplify the shape (fewer primitives), do not raise the limit`);
    return problems;
}

// Pure: sources in, { svg, names } out. Throws with every lint problem (not just the first) when a source is invalid.
export function build(sources = loadSources()) {
    const problems = sources.flatMap(lintOne);
    const seen = new Map();
    for (const s of sources) { if (seen.has(s.name)) problems.push(`core/icons/src: "${s.name}" is defined twice`); seen.set(s.name, s); }
    if (problems.length) throw new Error(`core/icons/build.mjs: ${problems.length} problem(s):\n- ${problems.join('\n- ')}`);

    const names = sources.map(s => s.name).sort();
    const symbols = sources // sprite order: filename order (matches the source folder listing, stable across runs)
        .map(({ name, text }) => `  <symbol id="${name}" viewBox="0 0 24 24">${text.trim().replace(/^<svg viewBox="0 0 24 24">/, '').replace(/<\/svg>$/, '')}</symbol>`)
        .join('\n');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">\n${symbols}\n</svg>\n`;

    const spriteBytes = Buffer.byteLength(svg.replace(/\n/g, '\r\n'), 'utf8');
    if (spriteBytes > SPRITE_BUDGET_BYTES) throw new Error(`core/icons/build.mjs: core/icons.svg is ${spriteBytes} bytes, over the ${SPRITE_BUDGET_BYTES}-byte budget set in core/icons/README.md - simplify or split the sprite, never raise the budget`);

    const json = `${JSON.stringify({ names }, null, 2)}\n`;
    const dts = `// GENERATED by core/icons/build.mjs from core/icons/src/*.svg: do not edit.\nexport type PkIconName =\n${names.map(n => `    | ${JSON.stringify(n)}`).join('\n')};\n`;
    return { svg, json, dts, names, spriteBytes };
}

function writeCrlf(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text.replace(/\r?\n/g, '\r\n')); }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const { svg, json, dts, names, spriteBytes } = build();
        writeCrlf(path.join(repoRoot, 'core', 'icons.svg'), svg);
        writeCrlf(path.join(root, 'icons.json'), json);
        writeCrlf(path.join(root, 'icons.d.ts'), dts);
        console.log(`core/icons/build.mjs: ${names.length} icons, ${spriteBytes} bytes (budget ${SPRITE_BUDGET_BYTES})`);
    } catch (e) {
        console.error(e.message);
        process.exit(1);
    }
}
