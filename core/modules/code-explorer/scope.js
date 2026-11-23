// Scoped search (issue 121, item 4): restricts the search results to a folder, a file extension and optionally leaves out test
// files. Pure functions over paths and result groups ([{ path, hits }]), no DOM, so they are unit-testable and apply to any provider.

const TEST_DIR = /(^|\/)(tests?|__tests__|spec)\//i;
const TEST_FILE = /[._-](test|tests|spec)\.[^/]+$|[a-z0-9](Tests?|Spec)\.[^/.]+$/;

export const isTestPath = path => TEST_DIR.test(path) || TEST_FILE.test(path);

export const extensionOf = path => { const m = /\.([^./]+)$/.exec(path); return m ? m[1].toLowerCase() : ''; };

// The distinct extensions of the loaded files, sorted, for the file type choices.
export const extensionsOf = files => [...new Set(files.map(f => extensionOf(f.path)).filter(Boolean))].sort();

// scope: { folder: 'src/api' (a path prefix, slashes trimmed), ext: 'cs' (no dot), skipTests: boolean }; an empty scope keeps everything.
export function inScope(path, scope = {}) {
    const folder = (scope.folder ?? '').trim().replace(/^\/+|\/+$/g, '');
    if (folder && path !== folder && !path.startsWith(`${folder}/`)) return false;
    const ext = (scope.ext ?? '').replace(/^\./, '').toLowerCase();
    if (ext && extensionOf(path) !== ext) return false;
    return !(scope.skipTests && isTestPath(path));
}

export const filterGroups = (groups, scope) => groups.filter(g => inScope(g.path, scope));
