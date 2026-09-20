// Plainkit tabs behaviour: arrow-key roving focus, click-to-select for vanilla pages, scroll-into-view of the
// active tab, and a close event. Framework-free; no imports.
//
// Markup contract: <div class="tabs" role="tablist" data-pk-tabs> holding <button class="tab" role="tab"
// aria-selected tabindex> children; the selected one has .active. An optional .tab-close button follows the tab it closes.
//
// Options (initTabs(root, options), each also readable from a data- attribute on the tablist):
//   data-pk-tabs="toggle"        the module moves .active / aria-selected / tabindex on click. Omit when a
//                                 host framework owns the selected state (keyboard, scroll and close event still work).
//   scrollIntoView (default true) keep the active tab visible in a scrolling strip. data-pk-scroll="off" disables it.
//   data-pk-close="remove"       (with toggle) a close button also removes the tab and selects a neighbour.
//                                 Without it the module only fires the event and the page decides.
// Events: "pk-tab-close" (bubbles, cancelable) on the tablist, detail { tab, list }.

// Next index for an arrow/Home/End key over `count` tabs, or null when the key is not a tabs key.
export function nextTabIndex(current, count, key) {
    if (count === 0) return null;
    switch (key) {
        case 'ArrowRight': return (current + 1) % count;
        case 'ArrowLeft': return (current - 1 + count) % count;
        case 'Home': return 0;
        case 'End': return count - 1;
        default: return null;
    }
}

// New scrollLeft that brings a tab fully into view, leaving `margin` px around it; unchanged when it is already visible.
export function scrollLeftFor(tabLeft, tabWidth, viewWidth, current, margin = 8) {
    if (tabLeft - margin < current) return Math.max(0, tabLeft - margin);
    const right = tabLeft + tabWidth + margin;
    if (right > current + viewWidth) return right - viewWidth;
    return current;
}

// Which index to select after removing `removed` from `count` tabs, or -1 when none are left.
export function indexAfterClose(removed, count) {
    if (count <= 1) return -1;
    return Math.min(removed, count - 2);
}

const tabsOf = list => Array.from(list.querySelectorAll(':scope > .tab'));

function select(list, tab) {
    for (const t of tabsOf(list)) {
        const on = t === tab;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
    }
}

function reveal(list, tab, options) {
    if (options.scrollIntoView === false || list.getAttribute('data-pk-scroll') === 'off') return;
    list.scrollLeft = scrollLeftFor(tab.offsetLeft, tab.offsetWidth, list.clientWidth, list.scrollLeft);
}

function closeTargetOf(button) {
    let node = button.previousElementSibling;
    while (node && !node.classList.contains('tab')) node = node.previousElementSibling;
    return node;
}

export function initTabs(root = document, options = {}) {
    const doc = root.ownerDocument ?? root;
    root.querySelectorAll?.('[data-pk-tabs] > .tab.active').forEach(tab => reveal(tab.parentElement, tab, options));

    root.addEventListener('keydown', event => {
        const list = event.target.closest?.('[data-pk-tabs]');
        if (!list) return;
        const tabs = tabsOf(list);
        const index = tabs.indexOf(event.target);
        if (index === -1) return;
        const next = nextTabIndex(index, tabs.length, event.key);
        if (next === null) return;
        event.preventDefault();
        tabs[next].focus();
        tabs[next].click();
    });

    root.addEventListener('click', event => {
        const close = event.target.closest?.('.tab-close');
        if (close) {
            const list = close.parentElement;
            if (!list?.hasAttribute('data-pk-tabs')) return;
            const tab = closeTargetOf(close);
            const CustomEventCtor = (doc.defaultView ?? globalThis).CustomEvent;
            const signal = new CustomEventCtor('pk-tab-close', { bubbles: true, cancelable: true, detail: { tab, list } });
            list.dispatchEvent(signal);
            if (signal.defaultPrevented || list.getAttribute('data-pk-tabs') !== 'toggle' || list.getAttribute('data-pk-close') !== 'remove' || !tab) return;
            const tabs = tabsOf(list);
            const removed = tabs.indexOf(tab);
            const wasActive = tab.classList.contains('active');
            tab.remove();
            close.remove();
            const rest = tabsOf(list);
            const pick = indexAfterClose(removed, tabs.length);
            if (wasActive && pick >= 0) { select(list, rest[pick]); reveal(list, rest[pick], options); }
            return;
        }

        const tab = event.target.closest?.('.tab');
        const list = tab?.parentElement;
        if (!list?.hasAttribute('data-pk-tabs')) return;
        if (list.getAttribute('data-pk-tabs') === 'toggle') select(list, tab);
        reveal(list, tab, options);
    });
}
