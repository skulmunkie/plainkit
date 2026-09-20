// Plainkit navigation behaviour: the hamburger (off-canvas side nav or top-navbar fold), the collapse-to-icons toggle and dropdowns.
// Framework-free; no imports.
//
// Markup (nav.css, shell.css):
//   hamburger      <button class="mobile-nav-toggle" data-pk-nav-toggle aria-expanded="false"> inside .top-row (side nav) or .tnav (top navbar)
//   backdrop       <div class="shell-backdrop" data-pk-nav-close>
//   collapse       <button data-pk-nav-collapse> inside .snav; toggles .snav--collapsed and .shell--collapsed
//                  Option data-pk-nav-persist="storage-key" remembers the choice in localStorage (skipped when storage is blocked).
//   dropdown       <div class="dropdown" data-pk-dropdown><button aria-expanded="false" aria-haspopup="true">..</button><div class="dropdown-menu" hidden>..</div></div>
// Escape closes an open drawer, navbar fold or dropdown; a click outside closes a dropdown; choosing an item closes it.

// Next open state for a drawer/dropdown given an event name: "toggle" flips; "open" and "close" set; "escape" and "outside" close.
export function nextOpen(open, event) {
    switch (event) {
        case 'toggle': return !open;
        case 'open': return true;
        case 'close':
        case 'escape':
        case 'outside': return false;
        default: return open;
    }
}

const safe = fn => { try { return fn(); } catch { return null; } };

function setDrawer(host, open) {
    const shell = host.closest('.shell');
    const bar = host.closest('.tnav');
    (bar ?? shell)?.classList.toggle(bar ? 'tnav--open' : 'shell--nav-open', open);
    document.querySelectorAll?.('[data-pk-nav-toggle]').forEach(b => b.setAttribute('aria-expanded', open ? 'true' : 'false'));
}

function setDropdown(box, open) {
    const button = box.querySelector('button');
    const menu = box.querySelector('.dropdown-menu');
    if (!button || !menu) return;
    menu.hidden = !open;
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
}

export function initNav(root = document) {
    const isOpen = box => box.querySelector('.dropdown-menu')?.hidden === false;

    root.addEventListener('click', event => {
        const t = event.target;
        const toggle = t.closest?.('[data-pk-nav-toggle]');
        if (toggle) {
            const shell = toggle.closest('.shell'); const bar = toggle.closest('.tnav');
            const open = (bar ?? shell)?.classList.contains(bar ? 'tnav--open' : 'shell--nav-open');
            setDrawer(toggle, nextOpen(!!open, 'toggle'));
            return;
        }
        if (t.closest?.('[data-pk-nav-close]')) { setDrawer(t.closest('.shell') ?? t, false); return; }

        const collapse = t.closest?.('[data-pk-nav-collapse]');
        if (collapse) {
            const nav = collapse.closest('.snav'); const shell = collapse.closest('.shell');
            const on = nav.classList.toggle('snav--collapsed');
            shell?.classList.toggle('shell--collapsed', on);
            const key = nav.getAttribute('data-pk-nav-persist');
            if (key) safe(() => localStorage.setItem(key, on ? '1' : '0'));
            return;
        }

        const drop = t.closest?.('[data-pk-dropdown]');
        for (const box of root.querySelectorAll('[data-pk-dropdown]')) if (box !== drop && isOpen(box)) setDropdown(box, nextOpen(true, 'outside'));
        if (!drop) return;
        if (t.closest('.dropdown-item')) setDropdown(drop, nextOpen(true, 'close'));
        else if (t.closest('button') === drop.querySelector('button')) setDropdown(drop, nextOpen(isOpen(drop), 'toggle'));
    });

    root.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        for (const box of root.querySelectorAll('[data-pk-dropdown]')) if (isOpen(box)) { setDropdown(box, nextOpen(true, 'escape')); box.querySelector('button')?.focus(); }
        for (const shell of root.querySelectorAll('.shell--nav-open, .tnav--open')) setDrawer(shell, false);
    });

    for (const nav of root.querySelectorAll?.('.snav[data-pk-nav-persist]') ?? []) {
        if (safe(() => localStorage.getItem(nav.getAttribute('data-pk-nav-persist'))) === '1') {
            nav.classList.add('snav--collapsed');
            nav.closest('.shell')?.classList.add('shell--collapsed');
        }
    }
}
