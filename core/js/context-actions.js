// Shared plumbing for an element that gives its rows/cards/items a context menu (issue #586): a pk-table row, a pk-kanban card, a
// pk-sortable item, a dock panel tab. Generalizes the pattern the layout builder built one-off for its canvas and palette (#432, PR #603):
// a pk-context-menu's pk-open event resolves which item was targeted, a small item list renders into pk-menu-item rows, and pk-select
// dispatches through the same run(action) map the element's toolbar or keyboard shortcuts already use. #586's own contract:
//   { action, label, shortcut?, disabled?, danger? }
//
//   import { wireContextMenu } from '../../js/context-actions.js';
//   const stop = wireContextMenu(menuEl, {
//       resolve: (detail) => detail.context,                      // pk-open's { x, y, target, context } -> whatever "target" means here
//       items: (target) => target ? [{ action: 'open', label: 'Open' }, { action: 'delete', label: 'Delete', danger: true }] : [],
//       run: (action, target) => this.doAction(action, target),   // same function the toolbar button / keyboard shortcut calls
//   });
//   // later: stop();
//
// menuEl is a pk-context-menu (or an element that upgrades into one). `resolve` gets pk-open's detail and returns the target passed to
// both `items` and `run`; the default resolve returns detail.context (the data-pk-context value pk-context-menu already reads off the
// nearest ancestor, e.g. a pk-table row's id) so most hosts pass no resolve at all. `items` runs every time the menu opens, so a
// row's own state (already selected, already expanded) can disable or relabel a row without the host having to repaint the menu itself.
// `run`'s return value is ignored; the menu simply closes after a select the way any other menu item does.
//
// Rows already open (via slot="menu") are removed and replaced each time: a context menu is small enough that painting it fresh is
// simpler than diffing, and it happens once per right click, not per frame.
const h = (doc, tag, attrs = {}, text) => {
    const e = doc.createElement(tag);
    for (const k in attrs) if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    if (text != null) e.textContent = text;
    return e;
};

export function wireContextMenu(menuEl, { items, run, resolve = detail => detail?.context } = {}) {
    const doc = menuEl.ownerDocument;
    let target = null;
    const paint = () => {
        for (const row of menuEl.querySelectorAll(':scope > [slot="menu"]')) row.remove();
        const list = items ? items(target) ?? [] : [];
        for (const it of list) {
            const row = h(doc, 'pk-menu-item', { slot: 'menu', value: it.action, 'data-action': it.action, disabled: !!it.disabled, danger: !!it.danger }, it.label);
            if (it.shortcut) row.append(h(doc, 'span', { slot: 'suffix' }, it.shortcut));
            menuEl.append(row);
        }
    };
    const onOpen = e => { target = resolve(e.detail); paint(); };
    const onSelect = e => {
        const row = e.target?.closest?.('pk-menu-item[data-action]');
        if (!row || row.disabled) return;
        run?.(row.dataset.action, target);
    };
    menuEl.addEventListener('pk-open', onOpen);
    menuEl.addEventListener('pk-select', onSelect);
    return () => { menuEl.removeEventListener('pk-open', onOpen); menuEl.removeEventListener('pk-select', onSelect); };
}
