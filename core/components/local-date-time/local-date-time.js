// Plainkit local time: <time datetime="..." data-local> shows its UTC instant in the browser's locale and time zone.
// Options: data-local="date" shows the date only. Framework-free; no imports.

export function formatLocal(iso, mode = 'datetime', locale) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return mode === 'date' ? d.toLocaleDateString(locale) : d.toLocaleString(locale);
}

export function initLocalTimes(root = document) {
    root.querySelectorAll?.('time[data-local]').forEach(t => { t.textContent = formatLocal(t.getAttribute('datetime'), t.getAttribute('data-local') || 'datetime'); });
}
