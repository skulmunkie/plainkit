// Shared by the elements that keep their chosen tab or section in the address (tab-param): read it on the first sync, write it later.
// history.replaceState with the current state: other parameters and the hash are kept and no history entry is added (no router navigation).
export const paramGet = (win, key) => new URL(win.location.href).searchParams.get(key);
export function paramKeep(win, key, value) {
    const url = new URL(win.location.href); url.searchParams.set(key, value); win.history.replaceState(win.history.state, '', url);
}
