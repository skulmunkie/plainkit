// Shared by the elements that keep their chosen tab or section in the address (tab-param): read it on the first sync, write it later.
// history.replaceState with the current state: other parameters and the hash are kept and no history entry is added (no router navigation).
// In a hash-routed app (#/path?query, the SDK router's hash mode) the query lives inside the hash: the hash is read and written as a path (#1958).
const at = win => { const u = new URL(win.location.href), h = u.hash.startsWith('#/'); return [h, h ? new URL(u.hash.slice(1), u.origin) : u, u]; };
export const paramGet = (win, key) => at(win)[1].searchParams.get(key);
export function paramKeep(win, key, value) {
    const [h, p, u] = at(win); p.searchParams.set(key, value);
    if (h) u.hash = p.pathname + p.search;
    win.history.replaceState(win.history.state, '', u);
}
