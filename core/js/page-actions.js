// One renderer for a page's list of actions (#1943, phase 1): the title bar calls it, the list toolbar and the wizard footer follow.
// An item is { key, label, icon?, href?, variant?, disabled?, busy?, group?, hint? }; `newAction` (the same shape) is drawn first, as the primary action.
// The accessible name is always the label; an item with an icon folds to the icon alone (the label stays its name and native tooltip, pk-button's own rule)
// at the bar-wide `actionsCollapse` ('always' | 'phone' | 'tablet' | 'none', default 'phone'). One `pk-action { key }` event per press, from the host.
// `group` is read by a later phase; for now a grouped item is a plain button.
export const COLLAPSES = ['always', 'phone', 'tablet', 'none'];

/** The items to draw, in order: newAction first (primary unless it names a variant), then the list. An item with neither key nor href is not drawn (`warn(key, message)`). */
export function actionItems(list = [], newAction, warn = () => {}) {
    const all = [...(newAction ? [{ variant: 'primary', ...newAction }] : []), ...list];
    return all.filter((a, i) => {
        const ok = a && (a.key || a.href);
        if (!ok) warn(`action:${i}`, `action ${i} has neither key nor href: not drawn`);
        else if (a.collapse !== undefined) warn('action:collapse', 'an item collapse is deprecated: use actionsCollapse on the bar');
        return ok;
    });
}

/** The nodes for `items` (pk-button, or pk-tooltip around it when there is a `hint`), each with slot `slot`; a press of a key item fires pk-action on `host`. */
export function renderActions(host, items, { collapse, slot = 'actions', warn = () => {} } = {}) {
    const doc = host.ownerDocument, mode = COLLAPSES.includes(collapse) ? collapse : 'phone';
    if (collapse !== undefined && mode !== collapse) warn('actionsCollapse', `actionsCollapse=${JSON.stringify(collapse)} is not one of ${COLLAPSES.join(', ')}: using phone`);
    return items.map(a => {
        const btn = doc.createElement('pk-button');
        btn.slot = slot;
        btn.textContent = a.label ?? a.key;
        if (a.variant) btn.variant = a.variant;
        if (a.href) btn.href = a.href;
        if (a.icon) { btn.iconName = a.icon; btn.collapse = a.collapse ?? mode; } else if (mode === 'always') warn('action:icon', `action "${a.key ?? a.href}" has no icon: actionsCollapse cannot fold it`);
        if (a.disabled) btn.disabled = true;
        if (a.busy) btn.busy = true;
        if (!a.href && !a.disabled && !a.busy) btn.addEventListener('click', () => host.dispatchEvent(new CustomEvent('pk-action', { bubbles: true, composed: true, detail: { key: a.key } })));
        if (!a.hint) return btn;
        const tip = doc.createElement('pk-tooltip');
        tip.text = a.hint; tip.slot = slot; btn.removeAttribute('slot');
        tip.append(btn);
        return tip;
    });
}
