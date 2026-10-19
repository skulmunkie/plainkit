import { mountApp } from './plainkit/js/app.js';

mountApp(document.getElementById('app'), {
    brand: { text: 'Team directory' },
    modules: [{ id: 'team', title: 'Team', icon: 'document', load: () => import('./team.js') }],
});
