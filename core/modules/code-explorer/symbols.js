// Declarations worth listing in the code explorer's outline: JS/TS functions, classes and consts at the top level, CSS rules with a
// class selector. Framework-free (no document, no node:fs): tools/snapshot.mjs uses this at build time for the embedded snapshot,
// and providers.js's LazyProvider uses the same function in the browser, computing a file's outline only once its content has been
// fetched (issue 196) -- one definition, so the two never drift apart.
export function symbolsOf(content, ext) {
    const symbols = [];
    const lines = content.split('\n');
    if (['js', 'mjs', 'ts', 'tsx', 'jsx'].includes(ext)) lines.forEach((line, i) => {
        const m = /^(export )?(async )?(function|class|const)\s+([A-Za-z_$][\w$]*)/.exec(line);
        if (m) symbols.push({ kind: m[3], name: m[4], line: i + 1, depth: 0 });
    });
    if (ext === 'css') lines.forEach((line, i) => {
        const m = /^(\.[\w-]+)[^{]*\{/.exec(line);
        if (m) symbols.push({ kind: 'rule', name: m[1], line: i + 1, depth: 0 });
    });
    return symbols;
}
