// The dev-tool modules as they ship in dist/modules/<name>/: their own unit (own manifest, own zip), separate from the runtime SDK in the rest of dist/.
//
// The unit sits at dist/modules/, two folders below the runtime root, exactly as modules/<name>/ sits two folders below core/ in the source tree, so a module's
// runtime imports ('../../js/log.js') and its page stylesheet ('../../plainkit.css') are the same text in both places and need no rewriting. What the source tree
// keeps in core/dist/ (the built files: elements/api.json, the manifest) is one folder further up in the release layout, so '../../dist/' becomes '../../',
// and a module that edits the token stylesheet ships its own copy so its folder is self-contained.
// Hosted apart from the runtime: js/mount-support.js (runtimeUrl) reads <meta name="plainkit-runtime"> for the assets, an import map remaps the script imports.
// Pure: the build passes in a reader.
import path from 'node:path';

// files: what the folder holds.
export const MODULES = {
    'code-explorer': { files: ['code-explorer.js', 'element.js', 'providers.js', 'tokenize.js', 'code-explorer.css'] },
    scorecard: { files: ['scorecard.js', 'sections.js', 'measure.js', 'scorecard.css'] },
    performance: { files: ['performance.js', 'performance.css'] },
    console: { files: ['console.js', 'console.css'] },
    logs: { files: ['logs.js', 'logs.css'] },
    'log-settings': { files: ['log-settings.js', 'log-settings.css'] },
    devtools: { files: ['devtools.js', 'panels.js', 'devtools.css'] },
    quality: { files: ['quality.js'] },
    'layout-builder': { files: ['layout-builder.js', 'layout-builder.css'] },
    'theme-editor': { files: ['theme-editor.js', 'sdk-tab.js', 'theme-editor.css'], tokens: true },
};

/** The folder of the unit inside dist/. */
export const MODULES_DIR = 'modules';

/** The files of the unit as a Map of path (relative to dist/, so modules/<name>/<file>) -> text; the unit's manifest is added by the build. */
export function modulesDist(read, root) {
    const out = new Map();
    for (const [name, { files, tokens }] of Object.entries(MODULES)) {
        if (tokens) out.set(`${MODULES_DIR}/${name}/tokens.css`, read(path.join(root, 'tokens', 'tokens.css')));
        for (const f of files) {
            const text = read(path.join(root, 'modules', name, f));
            if (!/\.js$/.test(f)) { out.set(`${MODULES_DIR}/${name}/${f}`, text); continue; }
            const dist = text.replaceAll("'../../dist/", "'../../").replace("'../../tokens/tokens.css'", "'./tokens.css'");
            if (/'\.\.\/\.\.\/dist\//.test(dist)) throw new Error(`${name}/${f}: a ../../dist/ path is left in the modules unit`);
            if (/const STYLES = /.test(text) && !dist.includes("const STYLES = ['../../plainkit.css']")) throw new Error(`${name}/${f}: STYLES must be the runtime's plainkit.css, two folders up`);
            out.set(`${MODULES_DIR}/${name}/${f}`, dist);
        }
    }
    return out;
}
