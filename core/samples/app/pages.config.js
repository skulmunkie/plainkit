// The page-type tour, the sample the "Build an app" guide is written from: one module (modules/tour.js) with a route for every family of page type.
export default {
    brand: { text: 'Page types' },
    modules: [{ id: 'tour', title: 'Tour', icon: 'document', load: () => import('./modules/tour.js') }],
    footer: { text: 'Plainkit demo app, page types' },
};
