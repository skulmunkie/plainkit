// Declarations worth listing in the code explorer's outline: JS/TS functions, classes and consts at the top level, CSS rules with a
// class selector, C# types and their methods, properties and constants (depth 1), and Razor directives, @code members and component
// tags (the C# side, PkSnapshot, uses the same rules, issue 121). Framework-free (no document, no node:fs): tools/snapshot.mjs uses this at build time for the embedded snapshot,
// and providers.js's LazyProvider uses the same function in the browser, computing a file's outline only once its content has been
// fetched (issue 196) -- one definition, so the two never drift apart.
const CS_MOD = String.raw`(?:(?:public|internal|private|protected|static|virtual|override|abstract|async|sealed|partial|readonly|extern|new|unsafe)\s+)`;
const CS_ATTR = String.raw`(?:\[[^\]]*\]\s*)*`;
// Without a modifier a member must sit one level in (4 spaces or a tab), so statements inside bodies do not match.
const CS_PLAIN = String.raw`(?:\s{4}|	)(?!(?:return|await|else|throw|yield|using|new|var|if|while|for|foreach|switch|lock|case|goto)\b)`;
const CS_TYPE = new RegExp(String.raw`^\s*${CS_MOD}*(class|record|interface|enum|struct)\s+([A-Za-z_]\w*)`);
const CS_CONST = new RegExp(String.raw`^\s+${CS_ATTR}${CS_MOD}*const\s+[\w<>.?\[\]]+\s+([A-Za-z_]\w*)\s*=`);
const CS_METHOD = new RegExp(String.raw`^(?:\s+${CS_ATTR}${CS_MOD}+|${CS_PLAIN}${CS_ATTR})[\w<>.?,\[\]]+\s+([A-Za-z_]\w*)\s*(?:<[^>]*>)?\s*\(`);
const CS_PROP = new RegExp(String.raw`^(?:\s+${CS_ATTR}${CS_MOD}+|${CS_PLAIN}${CS_ATTR})[\w<>.?,\[\]]+\s+([A-Za-z_]\w*)\s*(?:\{\s*(?:get|set|init)|=>)`);
const RZ_DIRECTIVE = /^@(page|inject|inherits|implements|using)\s+(?:\S+\s+(\w+)|(\S+))/;

// One C# line as a member (or type) entry, or null.
function csSymbol(line, depth) {
    let m = CS_TYPE.exec(line);
    if (m) return { kind: m[1], name: m[2], depth: 0 };
    if (depth === 0) return null;
    if ((m = CS_CONST.exec(line))) return { kind: 'const', name: m[1], depth };
    if ((m = CS_METHOD.exec(line))) return { kind: 'method', name: m[1], depth };
    if ((m = CS_PROP.exec(line))) return { kind: 'property', name: m[1], depth };
    return null;
}

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
    if (ext === 'cs') lines.forEach((line, i) => {
        const sym = csSymbol(line, 1);
        if (sym) symbols.push({ ...sym, line: i + 1 });
    });
    if (ext === 'razor') {
        const seen = new Set();
        let inCode = false;
        lines.forEach((line, i) => {
            if (/^@(code|functions)\s*\{/.test(line)) { inCode = true; symbols.push({ kind: 'code', name: '@code', line: i + 1, depth: 0 }); return; }
            if (inCode) { const sym = csSymbol(line, 1); if (sym) symbols.push({ ...sym, line: i + 1, depth: 1 }); return; }
            const d = RZ_DIRECTIVE.exec(line);
            if (d) { symbols.push({ kind: d[1], name: d[2] ?? d[3], line: i + 1, depth: 0 }); return; }
            for (const t of line.matchAll(/<([A-Z]\w*)[\s/>]/g)) if (!seen.has(t[1])) { seen.add(t[1]); symbols.push({ kind: 'component', name: t[1], line: i + 1, depth: 0 }); }
        });
    }
    return symbols;
}
