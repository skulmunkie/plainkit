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

// Resolve stylesheet paths written relative to a module against that module's own address.
export const styleUrls = (paths, base) => paths.map(p => new URL(p, base).href);

// A string option is a URL to fetch JSON from; anything else is the value itself.
export async function loadJson(value, fetchFn = globalThis.fetch) {
    if (typeof value !== 'string') return value;
    const res = await fetchFn(value);
    if (!res.ok) throw new Error(`${value}: ${res.status}`);
    return res.json();
}
