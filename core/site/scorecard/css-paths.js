// Where each element's stylesheet is, from the registry (elements/registry.js) rather than from a guessed `elements/<name>/<name>.css`:
// an element sits in its tier's folder (elements, components, pages, shells; #767) and the registry already names that folder in each module path.
// Returns { 'elements/button/button.css': ..., 'components/tabs/tabs.css': ... }, keys relative to core/, in registry order.

const REGISTRY_AT = 'elements/registry.js';

export function elementCssPaths(registry) {
    const out = {};
    for (const mod of Object.values(registry)) {
        const rel = new URL(mod.replace(/\.element\.js$/, '.css'), `file:///${REGISTRY_AT}`).pathname.slice(1);
        out[rel] = rel;
    }
    return out;
}
