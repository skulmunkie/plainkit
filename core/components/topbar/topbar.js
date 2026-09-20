// Plainkit search field: on a phone the search collapses to an icon button; the button turns the bar into a
// full-width field and Escape or the close button puts it back. Framework-free; no imports.
//
// Markup contract (topbar.css): <div class="app-search" data-pk-search> holding button.app-search-toggle,
// input.app-search-input and button.app-search-close. Open state is the .is-field class on the wrapper.
// Options: data-pk-search-openclass (default "is-field") names the class; data-pk-search-focus="off" skips moving focus.

export const DEFAULT_OPEN_CLASS = 'is-field';

// Next open state for an event: "toggle" and "focus" open, "close" and Escape close, anything else leaves it.
export function nextSearchState(open, event) {
    switch (event) {
        case 'toggle':
        case 'focus': return true;
        case 'close':
        case 'Escape': return false;
        default: return open;
    }
}

function apply(box, open, options) {
    const cls = box.getAttribute('data-pk-search-openclass') ?? options.openClass ?? DEFAULT_OPEN_CLASS;
    const was = box.classList.contains(cls);
    box.classList.toggle(cls, open);
    const focusOn = box.getAttribute('data-pk-search-focus') !== 'off' && options.focus !== false;
    if (open && !was && focusOn) box.querySelector('.app-search-input')?.focus();
    if (!open && was && focusOn) box.querySelector('.app-search-toggle')?.focus();
    box.querySelector('.app-search-toggle')?.setAttribute('aria-expanded', open ? 'true' : 'false');
}

export function initSearchFields(root = document, options = {}) {
    root.addEventListener('click', event => {
        const box = event.target.closest?.('[data-pk-search]');
        if (!box) return;
        if (event.target.closest('.app-search-toggle')) apply(box, nextSearchState(false, 'toggle'), options);
        else if (event.target.closest('.app-search-close')) apply(box, nextSearchState(true, 'close'), options);
    });
    root.addEventListener('keydown', event => {
        const box = event.target.closest?.('[data-pk-search]');
        if (!box || event.key !== 'Escape') return;
        event.preventDefault();
        apply(box, nextSearchState(true, 'Escape'), options);
    });
}
