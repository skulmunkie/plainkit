// One renderer for a page's list of actions (#1943, phase 1): the title bar calls it, the list toolbar and the wizard footer follow.
// An item is { key, label, icon?, href?, variant?, disabled?, busy?, group?, hint? }; `newAction` (the same shape) is drawn first, as the primary action.
// The accessible name is always the label; an item with an icon folds to the icon alone (the label stays its name and native tooltip, pk-button's own rule)
// at the bar-wide `actionsCollapse` ('always' | 'phone' | 'tablet' | 'none', default 'phone'). One `pk-action { key }` event per press, from the host.
// Items sharing a `group` string (#1943, phase 3) form one menu: a pk-dropdown whose trigger is named for the group, drawn where the group's first item stands; choosing an item fires the same one pk-action.
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

/** One pk-menu-item for an action item (the menu of a group here, the row menu of js/row-actions.js): its key is the value, a warn item is danger, disabled and busy items cannot be chosen. */
export function menuItem(doc, a) {
    return Object.assign(doc.createElement('pk-menu-item'), { value: a.key, textContent: a.label ?? a.key, disabled: !!(a.disabled || a.busy), danger: a.variant === 'warn' });
}

/** The menu for the items of one group: a pk-dropdown with a trigger button named for the group. A press on a key item goes to `press(item)`; an href item is a link and raises nothing. */
function groupMenu(doc, name, items, slot, press) {
    const menu = doc.createElement('pk-dropdown'), trigger = doc.createElement('pk-button');
    menu.placement = 'bottom-end';
    if (slot) menu.slot = slot;
    Object.assign(trigger, { slot: 'trigger', variant: 'ghost', textContent: name });
    menu.append(trigger, ...items.map(a => {
        const item = menuItem(doc, a);
        if (a.href) item.href = a.href;
        if (a.hint) item.title = a.hint;
        return item;
    }));
    menu.addEventListener('pk-select', e => {
        e.stopPropagation();
        const a = items.find(x => x.key === e.detail?.value);
        if (a && !a.href) press(a);
    });
    return menu;
}

/** The nodes for `items` (pk-button, or pk-tooltip around it when there is a `hint`), each with slot `slot`; a press of a key item fires pk-action on `host` (`onPress(item, fire)` takes over the press: a page with its own event calls `fire()` for the shared one). */
export function renderActions(host, items, { collapse, slot = 'actions', warn = () => {}, onPress } = {}) {
    const doc = host.ownerDocument, mode = COLLAPSES.includes(collapse) ? collapse : 'phone';
    if (collapse !== undefined && mode !== collapse) warn('actionsCollapse', `actionsCollapse=${JSON.stringify(collapse)} is not one of ${COLLAPSES.join(', ')}: using phone`);
    const fire = a => host.dispatchEvent(new CustomEvent('pk-action', { bubbles: true, composed: true, detail: { key: a.key } })), press = a => { if (onPress) onPress(a, () => fire(a)); else fire(a); };
    const drawn = new Set();
    return items.flatMap(a => {
        if (a.group) return drawn.has(a.group) ? [] : (drawn.add(a.group), [groupMenu(doc, a.group, items.filter(x => x.group === a.group), slot, press)]);
        const btn = doc.createElement('pk-button');
        if (slot) btn.slot = slot;
        btn.textContent = a.label ?? a.key;
        if (a.variant) btn.variant = a.variant;
        if (a.href) btn.href = a.href;
        if (a.icon) { btn.iconName = a.icon; btn.collapse = a.collapse ?? mode; } else if (mode === 'always') warn('action:icon', `action "${a.key ?? a.href}" has no icon: actionsCollapse cannot fold it`);
        if (a.disabled) btn.disabled = true;
        if (a.busy) btn.busy = true;
        if (!a.href && !a.disabled && !a.busy) btn.addEventListener('click', () => press(a));
        if (!a.hint) return [btn];
        const tip = doc.createElement('pk-tooltip');
        tip.text = a.hint; if (slot) tip.slot = slot; btn.removeAttribute('slot');
        tip.append(btn);
        return [tip];
    });
}
