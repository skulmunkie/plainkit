// THROWAWAY (#355): a module that only sends the reader to a page of the old site that is not a module of the app yet. Delete the entry in
// site/app.js, and this file with the last one, when that page becomes a real module.
import { defineModule } from '../../js/app.js';

export const redirectTo = (id, title, href) => defineModule({ id, title, routes: [{ path: '*', page: 'custom', config: { mount: () => location.replace(href) } }] });
