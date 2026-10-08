// Leave guard (#872): lazily loaded with the page type that uses it (js/app/pages/record.js), never part of the entry graph. While a page is dirty it asks
// before the app navigates away: an in-app link click, a pk-navigate (pk-link, breadcrumb) and the browser's back and forward. It sits in front of the router
// (capture listeners on the window), so the router needs no hook: a vetoed event never reaches it, and a confirmed one is replayed once the guard steps aside.
//   const g = leaveGuard(window, () => ctx.dialogs.confirm({ heading: 'Leave without saving?', confirmLabel: 'Leave', danger: true }));
//   g.dirty(true);  g.busy(true) // while the page's own save runs: its navigation is not a leave;  g.destroy() // on unmount
// A cancelled leave changes nothing: the page, its edits and the address stay (a back/forward is undone with replaceState). A confirmed one disarms the
// guard for good: the page is on its way out. Programmatic navigation (ctx.navigate, the search palette) is the page's or app's own call and is not asked.
export function leaveGuard(win, ask) {
    let dirty = false, busy = false, off = false, asking = false, armed = false, at = win.location.href;
    const live = () => dirty && !busy && !off;
    const confirm = () => {
        if (asking) return Promise.resolve(false);
        asking = true;
        return new Promise(r => r(ask())).then(ok => ok === true, () => false).finally(() => { asking = false; });
    };
    const leave = go => confirm().then(ok => { if (ok) { off = true; sync(); go(); } });
    const onClick = e => {
        const a = e.composedPath().find(n => n.localName === 'a' && n.hasAttribute('href'));
        if (!live() || !a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target || a.hasAttribute('download')) return;
        const url = new URL(a.href, win.location.href);
        if (url.origin !== win.location.origin || url.href === win.location.href) return;
        e.preventDefault();
        leave(() => a.click());
    };
    const onNavigate = e => {
        if (!live() || e.defaultPrevented || !e.detail?.to) return;
        e.preventDefault();
        const { target, detail } = e;
        leave(() => target.dispatchEvent(new win.CustomEvent('pk-navigate', { detail, bubbles: true, composed: true, cancelable: true })));
    };
    const onPop = e => {
        if (!live()) { at = win.location.href; return; }
        e.stopImmediatePropagation();
        const to = win.location.href;
        if (to === at) return; // the second event of one change (popstate, then hashchange): the first was already undone
        win.history.replaceState(win.history.state, '', at);
        leave(() => { win.history.replaceState(win.history.state, '', to); for (const t of ['popstate', 'hashchange']) win.dispatchEvent(new win.Event(t)); });
    };
    const sync = () => {
        const want = dirty && !off;
        if (want === armed) return;
        armed = want; at = win.location.href;
        const f = want ? 'addEventListener' : 'removeEventListener';
        win[f]('popstate', onPop, true); win[f]('hashchange', onPop, true);
        win.document[f]('click', onClick, true); win.document[f]('pk-navigate', onNavigate, true);
    };
    return {
        dirty(v) { dirty = Boolean(v); sync(); },
        busy(v) { busy = Boolean(v); },
        destroy() { dirty = false; sync(); },
    };
}
