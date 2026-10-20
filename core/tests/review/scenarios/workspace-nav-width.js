// pk-workspace nav-width and pk-tree-item long labels (#1696): a wide nav pane holds a tree of long identifiers; the label that still does not fit is cut with an ellipsis
// inside the pane, on one line, and the pane keeps the width the attribute asked for.
const WS = 'pk-workspace';

export default {
    name: 'workspace-nav-width',
    issue: [1696],
    elements: ['workspace', 'tree', 'tree-item'],
    viewports: ['desktop'],
    html: '<pk-workspace nav-width="md" nav-label="Tables"><pk-tree slot="nav" label="Tables"><pk-tree-item label="quarterly_revenue_by_region_and_product_line_2026"></pk-tree-item><pk-tree-item label="customers"></pk-tree-item></pk-tree><div class="stack"><h2>Tables</h2><p>Main pane</p></div></pk-workspace>',
    steps: [
        { shot: 'md' },
        { set: WS, attr: 'nav-width', value: 'xl' }, { wait: 'settle' }, { shot: 'xl' },
    ],
    expect(t) {
        t.inViewport(WS);
        t.within(`${WS} pk-tree-item`, `${WS} >>> [part=nav]`);
        t.noOverlap(`${WS} >>> [part=nav]`, `${WS} >>> [part=main]`);
    },
};
