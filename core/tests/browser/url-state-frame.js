// The page the list URL state cases (#1946) open in an iframe: one pk-data-table (or two with ?_two=1, prefixed a and b). The frame's own controls are ?_us=<prefix> (absent = urlState off),
// ?_init=1 (initial search, page and sort props) and ?_two=1; every other parameter belongs to the list or to the "host". Each load is recorded in window.calls.
import { loadElements } from '../../js/loader.js';

const q = new URLSearchParams(location.search);
window.calls = [];
const make = (id, prefix) => {
    const t = document.createElement('pk-data-table');
    t.id = id; t.label = id; t.pageSize = 10;
    t.columns = [{ key: 'name', label: 'Name', sortable: true }, { key: 'channel', label: 'Channel', sortable: true }];
    t.filters = [{ key: 'channel', type: 'select', label: 'Channel', options: ['ebay', 'etsy'] }];
    if (prefix !== null) t.urlState = prefix;
    if (q.has('_init')) { t.search = 'init'; t.page = 2; t.sort = 'channel'; }
    t.addEventListener('pk-url-change', e => { (window.urlEvents ??= []).push(e.detail.url); });
    t.load = async query => {
        window.calls.push({ id, ...JSON.parse(JSON.stringify(query)) });
        return { rows: query.page > 12 ? [] : Array.from({ length: 10 }, (_, i) => ({ id: i + 1 + (query.page - 1) * 10, name: `Item ${i}`, channel: 'ebay' })), total: 120 };
    };
    return t;
};
if (q.has('_two')) document.body.append(make('a', 'a'), make('b', 'b'));
else document.body.append(make('list', q.has('_us') ? q.get('_us') : null));
loadElements(document);
