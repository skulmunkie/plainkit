// The tool modules as they ship in dist/<name>/: the source in modules/<name>/ with its paths resolved for the dist layout, so each
// folder works wherever dist/ is copied or served from. Pure: the build passes in a reader.
import path from 'node:path';
import { relocate } from './gallery-dist.mjs';

// files: what the folder holds. The source imports the SDK stylesheet as one page sheet; dist splits it into the page layer and the
// class-based components, so the STYLES line is widened to both.
export const MODULES = {
    'code-explorer': { files: ['code-explorer.js'] },
    scorecard: { files: ['scorecard.js', 'scorecard.css'] },
};

const SOURCE_STYLES = "['../../plainkit.css']";
const DIST_STYLES = "['../plainkit.css', '../plainkit-compat.css']";

export function modulesDist(read, root) {
    const out = new Map();
    for (const [name, { files }] of Object.entries(MODULES)) {
        for (const f of files) {
            const text = read(path.join(root, 'modules', name, f));
            if (!/\.js$/.test(f)) { out.set(`${name}/${f}`, text); continue; }
            const dist = relocate(text).replace("['../plainkit.css']", DIST_STYLES);
            if (text.includes(SOURCE_STYLES) && !dist.includes(DIST_STYLES)) throw new Error(`${name}/${f}: STYLES did not relocate`);
            out.set(`${name}/${f}`, dist);
        }
    }
    return out;
}
