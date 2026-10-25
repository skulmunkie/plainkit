// pk-page-shell with the last crumb as its title, two badges and two actions (issue 1780): the badges follow the title on its line at every width.
export default {
    name: 'page-shell-chips-crumb',
    issue: [1780],
    elements: ['page-shell', 'page-header'],
    html: `<pk-page-shell home-href="#home" home-label="Home" crumbs='[{"label":"Purchase orders","href":"#po"},{"label":"PO-1042 North warehouse refit"}]'><pk-badge slot="badges">Open</pk-badge><pk-badge slot="badges" variant="ok">Paid</pk-badge><pk-button slot="actions">Edit</pk-button><pk-button slot="actions" variant="primary">Receive goods</pk-button><p>Body</p></pk-page-shell>`,
    steps: [{ shot: 'rest' }],
    expect(t) {
        t.inViewport('pk-page-shell');
    },
};
