// Which elements a piece of markup uses, worked out from the <pk-name> tags it carries. Shared by the samples test (each sample's meta
// "used" list is checked against it) and tools/samples-sync.mjs. The names are the element folder names, without the pk- prefix.

import { listElementFolders } from './element-folders.mjs';

// The elements used by markup or by a script that builds it: [name] for every <pk-name> tag that is a real element.
export function usedElements(text, elementNames = new Set()) {
    return [...new Set([...text.matchAll(/<pk-([a-z][a-z0-9-]*)/g)].map(m => m[1]).filter(n => elementNames.has(n)))].sort();
}

export function elementFolders(root) {
    return new Set(listElementFolders(root).map(e => e.name));
}
