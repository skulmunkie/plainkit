// The tool modules as they ship in dist/<name>/: the source in modules/<name>/ with its paths resolved for the dist layout, so each
// folder works wherever dist/ is copied or served from. Pure: the build passes in a reader.
import path from 'node:path';
import { relocate } from './gallery-dist.mjs';

// files: what the folder holds. The source imports the SDK stylesheet as one page sheet; relocate() drops one ../ from it for the dist layout.
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

const DIST_STYLES = "['../plainkit.css']";

export function modulesDist(read, root) {
    const out = new Map();
    for (const [name, { files, tokens }] of Object.entries(MODULES)) {
        // A module that edits the token stylesheet ships its own copy, like the gallery, so the folder stands alone.
        if (tokens) out.set(`${name}/tokens.css`, read(path.join(root, 'tokens', 'tokens.css')));
        for (const f of files) {
            const text = read(path.join(root, 'modules', name, f));
            if (!/\.js$/.test(f)) { out.set(`${name}/${f}`, text); continue; }
            // The source tree keeps the built files in core/dist/; in the release layout the module sits inside dist/, so they are one folder up.
            const dist = relocate(text.replace("'../../dist/'", "'../'")).replace("'../tokens/tokens.css'", "'./tokens.css'");
            if (text.includes("'../../dist/'") && !dist.includes("DIST = '../'")) throw new Error(`${name}/${f}: DIST did not relocate`);
            if (/const STYLES = /.test(text) && !dist.includes(`const STYLES = ${DIST_STYLES}`)) throw new Error(`${name}/${f}: STYLES did not relocate`);
            out.set(`${name}/${f}`, dist);
        }
    }
    return out;
}
