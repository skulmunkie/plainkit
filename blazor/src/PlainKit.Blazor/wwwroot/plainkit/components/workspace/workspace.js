// Plainkit workspace behaviour: one panel at a time on a phone. The tab strip carries a phone-only tab that swaps the
// content pane for the nav rail; every other tab swaps the visible panel. Framework-free; no imports.
//
// Markup (workspace.css): <div class="workspace workspace--fill" data-pk-workspace> holding aside.workspace-nav and
// main.workspace-main > .tabs[data-pk-tabs] + .workspace-pane. A tab with data-pk-workspace-nav is the phone-only nav
// tab (give it .tab--phone-only). A tab with data-pk-panel="id" shows the element with data-pk-panel-id="id" inside
// .workspace-pane and hides its siblings; without those attributes the host owns the pane content.
// Options: data-pk-workspace-navclass (default "workspace--nav") names the class set while the nav tab is active.

export const DEFAULT_NAV_CLASS = 'workspace--nav';

// Pure: which panel ids are visible, given the list of panel ids and the active one. Unknown ids show nothing.
export function visiblePanels(panelIds, activeId) {
    return panelIds.map(id => ({ id, visible: id === activeId }));
}

// Pure: whether the workspace shows the nav rail, given the active tab's attributes.
export const showsNav = tabAttrs => tabAttrs?.navTab === true;

function activate(box, tab) {
    const cls = box.getAttribute('data-pk-workspace-navclass') ?? DEFAULT_NAV_CLASS;
    const nav = tab.hasAttribute('data-pk-workspace-nav');
    box.classList.toggle(cls, showsNav({ navTab: nav }));
    const id = tab.getAttribute('data-pk-panel');
    if (id === null) return;
    const pane = box.querySelector('.workspace-pane');
    if (!pane) return;
    const panels = Array.from(pane.querySelectorAll('[data-pk-panel-id]'));
    for (const r of visiblePanels(panels.map(p => p.getAttribute('data-pk-panel-id')), id)) {
        panels.find(p => p.getAttribute('data-pk-panel-id') === r.id).hidden = !r.visible;
    }
}

// data-pk-toggle="#id" on a button shows or hides its target (a docked inspector) and mirrors the state in aria-pressed.
export function initToggles(root = document) {
    root.addEventListener('click', event => {
        const button = event.target.closest?.('[data-pk-toggle]');
        if (!button) return;
        const target = root.querySelector(button.getAttribute('data-pk-toggle'));
        if (!target) return;
        target.hidden = !target.hidden;
        button.setAttribute('aria-pressed', target.hidden ? 'false' : 'true');
    });
}

export function initWorkspaces(root = document) {
    initToggles(root);
    root.addEventListener('click', event => {
        const tab = event.target.closest?.('.tab');
        const box = tab?.closest('[data-pk-workspace]');
        if (!tab || !box || !tab.parentElement.hasAttribute('data-pk-tabs')) return;
        activate(box, tab);
    });
    root.querySelectorAll?.('[data-pk-workspace]').forEach(box => {
        const active = box.querySelector('[data-pk-tabs] > .tab.active');
        if (active) activate(box, active);
    });
}
