// The query of the address for the list view (url-state), lazy: location.search, or in a hash-routed app (#/path?query, the SDK router's hash mode) the part of the hash
// after "?". addrKeep writes it with history.replaceState with the current state, so other parameters and the hash path are kept and no history entry is added.
// (tab-param.js still reads location.search only: moving pk-tabs onto this costs every tabs page about 140 B brotli, see #1958.)
export const addrParams = win => { const h = win.location.hash, i = h.indexOf('?'); return h.startsWith('#/') ? new URLSearchParams(i < 0 ? '' : h.slice(i + 1)) : new URL(win.location.href).searchParams; };
export function addrKeep(win, params) {
    const url = new URL(win.location.href), h = url.hash, i = h.indexOf('?'), q = params.toString();
    if (h.startsWith('#/')) url.hash = (i < 0 ? h : h.slice(0, i)) + (q ? '?' + q : ''); else url.search = q;
    win.history.replaceState(win.history.state, '', url);
}
