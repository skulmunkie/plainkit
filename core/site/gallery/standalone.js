// The SDK's own gallery page: the site shell around the same module other projects embed. Options come from the query string
// (?kind=controls&group=forms-inputs) exactly as they do for embed.html.
import { mountShell } from '../shell.js';
import { mountGallery } from './gallery.js';
import { parseQuery } from '../../js/gallery-options.js';
import { h, addressOf } from '../../js/mount-support.js';

const doc = document;
mountShell({ page: 'gallery', title: null, search: { placeholder: 'Filter the gallery' } }, doc);
mountGallery(doc.querySelector('.site-body'), { ...parseQuery(new URL(addressOf(doc.defaultView).href).search), chrome: 'full', init: false }).catch(err => {
    const n = h(doc, 'pk-alert', { kind: 'danger', role: 'alert' }, `The gallery could not start: ${err.message}. Serve the Plainkit folder with any static file server (browsers block module scripts and fetch on file://).`);
    doc.body.append(h(doc, 'pk-container', { size: 'full' }, n));
});
