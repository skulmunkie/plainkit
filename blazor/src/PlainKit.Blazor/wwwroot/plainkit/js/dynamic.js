// Dynamic values go through the CSSOM, never a style attribute: applyDynamic
// applies data-dyn="prop:value; --token:value" (never used in copy-paste snippets).

export function applyDynamic(root = document) {
    for (const el of root.querySelectorAll('[data-dyn]')) for (const d of el.dataset.dyn.split(';')) { const i = d.indexOf(':'); if (i > 0) el.style.setProperty(d.slice(0, i).trim(), d.slice(i + 1).trim()); }
}
