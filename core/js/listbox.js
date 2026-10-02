// Plainkit listbox highlight, shared by pk-combobox, pk-select-menu and pk-command-palette: marks `row` (and only it) with `mark` (a class, or an
// attribute when it starts with `data-`), points the control's aria-activedescendant at it and scrolls it into view; no row clears the pointer.
export function highlightRow(rows, row, control, mark) {
    for (const r of rows) { if (mark.startsWith('data-')) r.toggleAttribute(mark, r === row); else r.classList.toggle(mark, r === row); }
    if (!row) { control.removeAttribute('aria-activedescendant'); return; }
    control.setAttribute('aria-activedescendant', row.id);
    row.scrollIntoView?.({ block: 'nearest' });
}
