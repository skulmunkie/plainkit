// Actions overflow for a list page whose toolbar sits in the title row (#1956). Loaded only when `toolbarInHeader` and `actionsOverflow` are both set, so the page layer pays nothing for it.
// The same contract as pk-page-header's actionsOverflow: at the named width and below ('phone' | 'tablet') or always ('always') the action buttons stay in the page but are hidden,
// and one "more" trigger opens a menu with one item per action; choosing an item presses its button (so a key item raises the shared pk-action, an href item navigates).
import { mediaBelow } from './breakpoints.js';
import { loadElements } from './loader.js';

const MODES = ['phone', 'tablet', 'always'];

/**
 * `nodes` are what renderActions drew for `items`, in the same order. Returns a function that stops listening and removes the menu.
 * `label` names the trigger (default "More actions").
 */
export function overflowActions(box, items, nodes, { mode, label = 'More actions' } = {}) {
    if (!MODES.includes(mode) || !nodes.length) return () => {};
    const doc = box.ownerDocument, menu = doc.createElement('pk-dropdown'), trigger = doc.createElement('pk-button');
    menu.setAttribute('placement', 'bottom-end');
    Object.assign(trigger, { slot: 'trigger', variant: 'ghost', icon: true, iconName: 'more', label });
    menu.append(trigger, ...items.map((item, i) => {
        const row = doc.createElement('pk-menu-item');
        row.textContent = item.label ?? item.key;
        if (item.disabled || item.busy) row.setAttribute('disabled', '');
        if (item.variant === 'danger') row.setAttribute('danger', '');
        if (item.icon) { const icon = doc.createElement('pk-icon'); icon.slot = 'prefix'; icon.setAttribute('name', item.icon); row.append(icon); }
        row.$press = () => (nodes[i].querySelector?.('pk-button') ?? nodes[i]).click();
        return row;
    }));
    menu.addEventListener('pk-select', e => { e.stopPropagation(); e.detail.item.$press?.(); });
    box.append(menu);
    loadElements(box);
    const query = mode === 'always' ? null : mediaBelow(mode);
    const apply = () => {
        const folded = !query || query.matches;
        for (const node of nodes) node.hidden = folded;
        menu.hidden = !folded;
    };
    query?.addEventListener('change', apply);
    apply();
    return () => { query?.removeEventListener('change', apply); menu.remove(); for (const node of nodes) node.hidden = false; };
}
