// Which elements can load a core/js module, for the --changed selections (scripts/blazor-browser-select.mjs). Rule: never narrower than a browser can load.
// A module is FULL (the caller runs everything) when it, or a module that imports it (transitively), is imported by anything that is not an element folder or
// another core/js module (the Blazor bridge, core/modules, the gallery, a sample); when it reaches core/js/element.js (every generated element module imports it);
// when a computed import() could load it; or when its file name appears in a string outside an import statement (a script src, a modulepreload list, a URL
// built at run time, the build). Otherwise it is { elements: [...] }: the element folders whose files import it (maybe none: nothing loads it).
import fs from 'node:fs';
import path from 'node:path';
import { importsOf } from './ui-review-cache.mjs';

const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g; // the statements importsOf reads; removed before the string search
export const SCAN_DIRS = ['core/js', 'core/elements', 'core/components', 'core/pages', 'core/shells', 'core/modules', 'core/site', 'core/samples', 'core/layouts', 'core/tools', 'blazor/src/PlainKit.Blazor', 'blazor/samples', 'blazor/mappings', 'scripts/generate-blazor.mjs'];
const SKIP_DIRS = new Set(['node_modules', 'bin', 'obj', 'dist', 'tests', 'Generated']);
const SCAN_FILE = /\.(m?js|html|razor|cs|cshtml|json)$/;
const GENERATED = /\.element\.js$|^core\/elements\/registry\.js$|^core\/site\/gallery\/gallery\.data\.js$|^core\/js\/version\.js$|\/wwwroot\/plainkit\/|^core\/site\/files\/|^core\/site\/scorecard\/api\.(current|baseline)\.json$/;
const ELEMENT_BASE = 'core/js/element.js';
/** Files whose computed import() was reviewed: what they load is not a core/js module by path. A computed import anywhere else makes every module FULL. */
export const REVIEWED_COMPUTED_IMPORTS = {
    'core/js/loader.js': 'the registry and the element modules it names',
    'core/js/loader-missing.js': 'the registry',
    'core/js/log-outputs.js': "the registry and pk-toast-stack's element module",
    'core/js/store-extras.js': 'a method named import, not an import',
    'core/site/gallery/pattern-mount.js': 'the pattern pages under core/samples/patterns (preview.js)',
    'core/tools/build.mjs': 'the generated gallery.data.js loads gallery data files',
    'core/tools/bundle-page.mjs': 'node, reads the registry at build time',
};
const COMPUTED = /(?<![.\w$])import\(\s*(?![\s'"`)])/;
const TEMPLATE = /(?<![.\w$])import\(\s*`([^`$]*)/g;

const walk = (root, rel) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return [];
    if (fs.statSync(abs).isFile()) return [rel];
    return fs.readdirSync(abs, { withFileTypes: true }).flatMap(d => (d.isDirectory() ? (SKIP_DIRS.has(d.name) ? [] : walk(root, `${rel}/${d.name}`)) : [`${rel}/${d.name}`]));
};

/** Reads the checkout once and returns usersOf(repo-relative path) -> { full: reason } | { elements: [names] }. */
export function coreJsUsers(root) {
    const files = SCAN_DIRS.flatMap(d => walk(root, d)).filter(r => SCAN_FILE.test(r) && !/\.test\.mjs$/.test(r) && !GENERATED.test(r));
    const importers = new Map(), strings = new Map(), prefixes = [];
    let unreviewed = null;
    for (const r of files) {
        const text = fs.readFileSync(path.join(root, r), 'utf8');
        strings.set(r, text.replace(IMPORT, ''));
        if (!/\.m?js$/.test(r)) continue;
        for (const m of text.matchAll(TEMPLATE)) { const p = path.posix.join(path.posix.dirname(r), m[1]); prefixes.push([m[1] === '' || m[1].endsWith('/') ? p.replace(/\/?$/, '/') : p, r]); }
        if (COMPUTED.test(text) && !REVIEWED_COMPUTED_IMPORTS[r]) unreviewed ??= r;
        for (const spec of importsOf(text)) {
            let t = path.posix.normalize(path.posix.join(path.posix.dirname(r), spec)).replace(/^blazor\/src\/PlainKit\.Blazor\/wwwroot\/plainkit\//, 'core/');
            if (!path.posix.extname(t)) t += '.js';
            if (!importers.has(t)) importers.set(t, new Set());
            importers.get(t).add(r);
        }
    }
    const elementOf = r => /^core\/(elements|components|pages|shells)\/([^/]+)\//.exec(r)?.[2];
    const esc = s => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
    return function usersOf(file) {
        const f = file.replace(/\\/g, '/');
        if (!/^core\/js\/.+\.js$/.test(f) || !strings.has(f)) return { full: 'not a core/js module of this checkout' };
        if (unreviewed) return { full: `a computed import() in ${unreviewed} is not reviewed (scripts/core-js-users.mjs REVIEWED_COMPUTED_IMPORTS)` };
        const tpl = prefixes.find(([p]) => f.startsWith(p));
        if (tpl) return { full: `a computed import() in ${tpl[1]} can load it` };
        const elements = new Set(), seen = new Set(), queue = [f];
        while (queue.length) {
            const g = queue.pop();
            if (seen.has(g)) continue;
            seen.add(g);
            if (g === ELEMENT_BASE) return { full: `it reaches ${ELEMENT_BASE}, which every element module imports` };
            const named = new RegExp(`(['"\`])[^'"\`\\n]*(?<![\\w-])${esc(path.posix.basename(g))}(?:\\?[^'"\`\\n]*)?\\1`);
            for (const [r, s] of strings) if (r !== g && named.test(s)) return { full: `${g} is named in a string in ${r}` };
            for (const i of importers.get(g) ?? []) {
                const e = elementOf(i);
                if (e) elements.add(e);
                else if (i.startsWith('core/js/')) queue.push(i);
                else return { full: `${g} is imported by ${i}` };
            }
        }
        return { elements: [...elements].sort() };
    };
}
