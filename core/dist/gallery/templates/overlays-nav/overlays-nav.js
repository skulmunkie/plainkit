// Wiring for the overlays and navigation sample: the elements do the work; this only connects the demo buttons to their public API
// (show/hide, the palette's items property) and to the toast helper. Nothing here is needed by the components themselves.
// The element loader (js/element.js) registers the pk-* tags on demand when the page uses them.

import { initPlainkit } from '../../../js/plainkit.js';
import Toast from '../../../elements/toast-stack.js';

initPlainkit();
globalThis.PkToast = Toast;

const $ = selector => document.querySelector(selector);

document.addEventListener('click', event => {
    const opener = event.target.closest('[data-open]');
    if (opener) { $(opener.getAttribute('data-open'))?.show?.(); return; }
    if (event.target.closest('[data-close]')) { event.target.closest('pk-drawer, pk-dialog')?.hide?.(); return; }
    const toaster = event.target.closest('[data-toast]');
    if (toaster) globalThis.PkToast?.show('Draft saved.', { kind: toaster.getAttribute('data-toast'), heading: 'Saved', action: { label: 'Undo' } });
});

const palette = $('#palette');
if (palette) {
    palette.items = [
        { id: 'dash', label: 'Go to Dashboard', group: 'Navigate', href: '#' },
        { id: 'orders', label: 'Go to Orders', group: 'Navigate', href: '#', keywords: 'sales' },
        { id: 'products', label: 'Go to Products', group: 'Navigate', href: '#', keywords: 'catalog inventory' },
        { id: 'new-po', label: 'New purchase order', group: 'Create', shortcut: 'N' },
        { id: 'new-product', label: 'New product', group: 'Create' },
        { id: 'theme', label: 'Toggle dark theme', group: 'Settings' },
    ];
}
