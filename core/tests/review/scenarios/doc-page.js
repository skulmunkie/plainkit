// pk-doc-page (App framework step 7, issue 353): the page type built from the guides page. What it shows once an item has loaded (a nav of items with the current one
// marked, an article with a title, summary and body, a table of contents and a pager), the home list when no item is current, the loading state while an item is on its way,
// the error state with Retry when it fails, and on a phone the nav as a drawer opened by the Menu button. The element is wired in setup() (loadItem and href are callback
// properties, never markup), so every state is the real one.
const ITEMS = [
    { id: 'start', title: 'Getting started', summary: 'Install and first page.' },
    { id: 'theming', title: 'Theming', summary: 'Tokens and dark mode.' },
    { id: 'logging', title: 'Logging', summary: 'The SDK logger.' },
];
const BODY = id => `<h2 id="one">First heading</h2><p>${id} body: some text so that the article has a height worth scrolling past.</p><p>More text under the first heading.</p><h2 id="two">Second heading</h2><p>Text under the second heading.</p><h3 id="two-a">A sub heading</h3><p>Text under the sub heading.</p>`;
const cfg = id => ({ items: ITEMS, id, search: true, home: { title: 'Guides', summary: 'Getting started, theming and logging.' } });

export default {
    name: 'doc-page',
    elements: ['doc-page', 'side-nav', 'toc', 'pager'],
    html: '<pk-doc-page id="doc"></pk-doc-page>',
    setup(frame) {
        const el = frame.querySelector('#doc');
        el.href = (id, anchor) => `#/${id}${anchor ? `/${anchor}` : ''}`;
        el.loadItem = id => {
            if (id === 'logging') return Promise.reject(new Error('The guide could not be loaded.'));
            if (id === 'theming') return new Promise(resolve => setTimeout(() => resolve({ title: 'Theming', summary: 'Tokens and dark mode.', html: BODY(id) }), 1500));
            const item = ITEMS.find(i => i.id === id);
            return item ? { title: item.title, summary: item.summary, html: BODY(id) } : null;
        };
        el.config = cfg(null);
    },
    steps: [
        { shot: 'home' },
        { set: '#doc', prop: 'config', value: cfg('start') }, { wait: 400 }, { shot: 'item' },
        { click: '#doc pk-button', on: ['phone'] }, { wait: 400, on: ['phone'] }, { shot: 'menu-open', on: ['phone'] },
        { click: '#doc pk-side-nav >>> [part=backdrop]', on: ['phone'] }, { wait: 300, on: ['phone'] },
        { set: '#doc', prop: 'config', value: cfg('theming') }, { wait: 150 }, { shot: 'loading' },
        { wait: 1700 },
        { set: '#doc', prop: 'config', value: cfg('logging') }, { wait: 300 }, { shot: 'error' },
    ],
    expect(t) {
        const phone = t.viewport.name === 'phone';
        t.inViewport('#doc');
        if (t.shot === 'home') {
            t.hasText('#doc h1', 'Guides');
            t.hasText('#doc ul', 'Getting started');
            if (phone) t.visible('#doc pk-button', 'the Menu button that opens the nav drawer'); else t.visible('#doc pk-side-nav', 'the item nav');
        }
        if (t.shot === 'item') {
            t.hasText('#doc h1', 'Getting started');
            t.hasText('#doc .prose', 'First heading');
            t.exists('#doc pk-nav-item[current]');
            t.visible('#doc pk-pager', 'the pager');
            t.visible('#doc pk-toc', 'the table of contents');
            // The viewport is at or below the wide breakpoint, where the page stacks: the table of contents sits above the article, both inside the column.
            const toc = t.rect('#doc pk-toc'), title = t.rect('#doc h1');
            if (toc && title) t.ok(toc.bottom <= title.y + 1, `the table of contents (ends y=${Math.round(toc.bottom)}) should stack above the article title (starts y=${Math.round(title.y)}) at or below 1280px`);
            t.noOverlap('#doc pk-toc', '#doc h1');
        }
        if (t.shot === 'menu-open') {
            t.visible('#doc pk-side-nav', 'the nav drawer, opened by the Menu button');
            t.hasText('#doc pk-side-nav', 'Theming');
            if (phone) t.atLeast('#doc pk-side-nav >>> [part=filter-input]', 'height', 44); // issue 550: the filter is a tap target on a phone
        }
        if (t.shot === 'loading') {
            t.visible('#doc pk-skeleton', 'the skeleton that holds the space while the item loads');
            t.hasText('#doc h1', 'Theming'); // the item on its way, from config.items, not the previous one's title
            t.hidden('#doc pk-toc', 'the previous item\'s table of contents');
        }
        if (t.shot === 'error') {
            t.hasText('#doc h1', 'Logging');
            t.hidden('#doc pk-toc', 'the previous item\'s table of contents');
            t.visible('#doc pk-alert[kind=danger]', 'the error alert');
            t.hasText('#doc pk-alert[kind=danger]', 'could not be loaded');
            t.visible('#doc pk-alert pk-button', 'the Retry button');
        }
    },
};
