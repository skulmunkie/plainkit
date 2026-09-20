// The SDK's own gallery page: the site shell around the same module other projects embed. Options come from the query string
// (?kind=controls&group=forms-inputs) exactly as they do for embed.html.
import { mountShell } from '../shell.js';
import { mountGallery } from './gallery.js';
import { parseQuery } from '../../js/gallery-options.js';

mountShell({ page: 'gallery', title: null, search: { placeholder: 'Filter the gallery' } });
mountGallery(document.querySelector('.site-body'), { ...parseQuery(location.search), chrome: 'full' }).catch(err => {
    const n = document.createElement('div');
    n.className = 'notice notice--error gx-notice-file';
    n.setAttribute('role', 'alert');
    n.textContent = `The gallery could not start: ${err.message}. Serve the Plainkit folder with any static file server (browsers block module scripts and fetch on file://).`;
    document.body.append(n);
});
