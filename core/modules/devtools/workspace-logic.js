// The pure decisions behind the dev tools workspace (workspace.js): is the gallery installed, and which tab opens first. No DOM, so node tests cover it.

export const GALLERY_NOTICE = ['The Gallery is not installed', 'This build leaves the gallery out. Add the gallery option (PkExtra.Gallery in Blazor) to browse every element here; the Files and Scorecard tabs work without it.'];

// True unless the gallery's embed page is known to be missing. `declared` (options.gallery.available) wins; otherwise the page is asked for once. A failed request (offline, blocked)
// does not say it is missing, so it counts as present: the gallery then reports its own load problem.
export async function galleryAvailable(url, declared, fetchFn = globalThis.fetch) {
    if (typeof declared === 'boolean') return declared;
    try { return (await fetchFn(url, { method: 'HEAD' })).ok; } catch { return true; }
}

// The tab that opens first: the one asked for when it is offered; with none asked for, the first offered one, but Files when the gallery is missing.
export function firstWorkspace(keys, requested, hasGallery) {
    if (keys.includes(requested)) return requested;
    return !hasGallery && keys.includes('files') ? 'files' : keys[0];
}
