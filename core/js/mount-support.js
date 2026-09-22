// Shared by the mountX(container, options) modules (gallery tools shipped in dist): making sure the SDK stylesheets are in the
// document the module mounts into, and telling apart a URL from a ready object in an option. No DOM beyond the one document passed in.

// Add a <link rel="stylesheet"> for each absolute href the document does not already load; resolves when all have loaded (or failed:
// the mount goes ahead unstyled rather than never).
export function ensureStyles(hrefs, doc = document) {
    const have = new Set([...doc.querySelectorAll('link[rel="stylesheet"]')].map(l => l.href));
    return Promise.all(hrefs.filter(h => !have.has(h)).map(href => new Promise(resolve => {
        const link = doc.createElement('link');
        link.rel = 'stylesheet'; link.href = href;
        link.addEventListener('load', resolve, { once: true });
        link.addEventListener('error', resolve, { once: true });
        doc.head.append(link);
    })));
}

// Where the runtime (js/, plainkit.css, elements/api.json) is for a tool module. The modules ship in <dist>/modules/<tool>/ and write their runtime paths relative to that,
// so by default the runtime is the folder two levels up. When the modules are hosted apart from the runtime, name the runtime once on the page:
//   <meta name="plainkit-runtime" content="https://host/plainkit/">   (the folder that holds plainkit.css, js/ and elements/; the module scripts' own imports are remapped with an import map)
// A path that stays inside the modules folder (a tool's own stylesheet, tokens.css) is never remapped.
export function runtimeUrl(path, base, doc = globalThis.document) {
    const url = new URL(path, base).href;
    const configured = doc?.querySelector?.('meta[name="plainkit-runtime"]')?.content;
    const root = new URL('../../', base).href;
    if (!configured || url.startsWith(new URL('../', base).href) || !url.startsWith(root)) return url;
    return new URL(url.slice(root.length), new URL(configured, doc.baseURI)).href;
}

// Resolve stylesheet paths written relative to a module against that module's own address (through runtimeUrl).
export const styleUrls = (paths, base, doc) => paths.map(p => runtimeUrl(p, base, doc));

// A string option is a URL to fetch JSON from; anything else is the value itself.
export async function loadJson(value, fetchFn = globalThis.fetch) {
    if (typeof value !== 'string') return value;
    const res = await fetchFn(value);
    if (!res.ok) throw new Error(`${value}: ${res.status}`);
    return res.json();
}
