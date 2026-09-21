// The search-results pattern, made live: typing filters the rows of every group, marks the match, renumbers the rows, hides a group with no
// match and shows an empty state when nothing is left. Ctrl+K (Cmd+K) focuses the field; ArrowDown moves into the results.
// mount(root) works on this sample's own DOM and returns { destroy() }; the one listener outside it (the shortcut on the document) is removed there.
import { createLogger } from '../../../js/log.js';

const log = createLogger('pattern:search-results');

export default function mount(root) {
    const ac = new AbortController();
    const query = root.querySelector('[data-query]');
    const groups = [...root.querySelectorAll('[data-group]')];
    const empty = root.querySelector('[data-empty]');
    if (!query || !groups.length) { log.warn('the search-results sample needs a [data-query] and [data-group] blocks', { root }); return { destroy() {} }; }

    // Each row's plain text, taken once: the marks are drawn from it, so a new query never reads text a previous one changed.
    const rows = groups.map(g => [...g.querySelectorAll('pk-list-group > button')].map(row => {
        const label = row.querySelector('[data-label]');
        if (!label) log.warn('a result row has no [data-label]', { row });
        return { row, label, n: row.querySelector('[data-n]'), text: label?.textContent ?? '' };
    }));

    const draw = (label, text, needle) => {
        const at = needle ? text.toLowerCase().indexOf(needle) : -1;
        if (at < 0) { label.textContent = text; return; }
        const mark = document.createElement('mark');
        mark.textContent = text.slice(at, at + needle.length);
        label.replaceChildren(text.slice(0, at), mark, text.slice(at + needle.length));
    };
    const filter = value => {
        const needle = String(value ?? '').trim().toLowerCase();
        let total = 0;
        groups.forEach((g, gi) => {
            let shown = 0;
            for (const r of rows[gi]) {
                const hit = r.label && (needle === '' || r.text.toLowerCase().includes(needle));
                r.row.hidden = !hit;
                if (!hit) continue;
                shown += 1;
                draw(r.label, r.text, needle);
                if (r.n) r.n.textContent = String(shown);
            }
            g.hidden = shown === 0;
            const count = g.querySelector('[data-count]');
            if (count) count.textContent = `(${shown})`;
            total += shown;
        });
        if (empty) empty.hidden = total > 0;
    };

    filter(query.getAttribute('value'));
    query.addEventListener('input', () => filter(query.value), { signal: ac.signal });
    query.addEventListener('keydown', e => {
        if (e.key !== 'ArrowDown') return;
        const first = root.querySelector('[data-group]:not([hidden]) pk-list-group > button:not([hidden])');
        if (first) { e.preventDefault(); first.focus(); }
    }, { signal: ac.signal });
    document.addEventListener('keydown', e => {
        if (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey) && !e.altKey) { e.preventDefault(); query.focus(); }
    }, { signal: ac.signal });

    return { destroy() { ac.abort(); } };
}
