// Dynamic values go through the CSSOM, never a style attribute: syncProgress sets .progress bars from aria-valuenow; applyDynamic
// applies data-dyn="prop:value; --token:value" (never used in copy-paste snippets).

export function syncProgress(root = document) {
    for (const bar of root.querySelectorAll('.progress[aria-valuenow]')) {
        const [now, min, max] = ['now', 'min', 'max'].map((k, i) => Number(bar.getAttribute(`aria-value${k}`) ?? [0, 0, 100][i]));
        if (bar.firstElementChild) bar.firstElementChild.style.width = `${max > min ? Math.min(Math.max((now - min) / (max - min), 0), 1) * 100 : 0}%`;
    }
}

export function applyDynamic(root = document) {
    for (const el of root.querySelectorAll('[data-dyn]')) for (const d of el.dataset.dyn.split(';')) { const i = d.indexOf(':'); if (i > 0) el.style.setProperty(d.slice(0, i).trim(), d.slice(i + 1).trim()); }
}
