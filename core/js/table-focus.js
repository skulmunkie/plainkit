// The row and search focus of pk-data-table (#885), kept out of the element so its own module stays inside the per-element budget (#2046).
// where: undefined = the search box (the first row when the search is hidden); 'search'; 'next' (the row after the focused one, the first when none has focus); 'previous', 'first', 'last' (only while a row has focus). Returns whether focus moved.
export function focusRow(host, where) {
    const tbl = host.part('table').shadowRoot, rows = [...(tbl?.querySelectorAll('tbody tr[data-pk-context]') ?? [])], at = rows.indexOf(tbl?.activeElement);
    const found = host.part('filters').shadowRoot?.querySelector('[part="search"]'), box = found?.offsetWidth ? found : null; // drawn and shown
    let to;
    if (where === 'next') to = rows[Math.min(at + 1, rows.length - 1)];
    else if (where === 'search') to = box;
    else if (typeof where === 'string') to = at < 0 ? undefined : rows[Math.max({ previous: at - 1, first: 0, last: rows.length - 1 }[where] ?? at, 0)];
    else to = box ?? rows[0];
    to?.focus();
    return !!to;
}
