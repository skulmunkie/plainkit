// The search controls take the control radius by default and a theme can make them pills (1706): two filter rows and two app-bar searches, the second of each themed.
export default {
    name: 'search-radius-hook',
    issue: [1706],
    elements: ['table-filters', 'app-bar-search'],
    html: `<pk-stack>
<pk-table-filters id="a" label="Search products" filter-count="1"><pk-select label="Category"><option>Accessories</option></pk-select></pk-table-filters>
<pk-table-filters id="b" label="Search products" filter-count="1"><pk-select label="Category"><option>Accessories</option></pk-select></pk-table-filters>
<pk-app-bar-search id="c" placeholder="Search"></pk-app-bar-search>
<pk-app-bar-search id="d" placeholder="Search"></pk-app-bar-search>
</pk-stack>`,
    steps: [
        { set: '#b', prop: 'style', value: '--pk-table-filters-radius: var(--radius-pill)' },
        { set: '#d', prop: 'style', value: '--pk-app-bar-search-radius: var(--radius-pill)' },
        { wait: 200 },
        { shot: 'rest' },
    ],
    expect(t) {
        t.visible('#a >>> [part=search]'); if (t.viewport.name === 'desktop') t.visible('#d >>> [part=box]');
    },
};
