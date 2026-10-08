// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
// 'record' (#353): <pk-record-page>; config: { fields, sidebar, heading, saveLabel, editable, mode, idParam } as data, and the callbacks
// load(id, ctx) -> record and save(values, ctx) -> void | updated values (reject with { errors: { field: message } } for inline errors).
// The record id is the route param named config.idParam (default 'id'); with none the page is a new record.
// Unsaved edits are guarded (#872): leaving by a link, a breadcrumb or back/forward asks through ctx.dialogs.confirm first (js/app/pages/svc-leave-guard.js, loaded with this chunk, not the entry).
// PAGE_TYPE: read at build time by core/tools/audit/data.mjs (design section 3.2); not used at runtime.
export const PAGE_TYPE = {
    id: 'record',
    summary: 'A single record form: fields, sidebar, save.',
    configKeys: ['fields', 'sidebar', 'heading', 'saveLabel', 'editable', 'mode', 'idParam', 'load', 'save'],
    states: [],
    useWhen: 'Viewing or editing one record identified by a route param, new or existing.',
};
import { mountTitled } from '../../page-shell.js';
import { leaveGuard } from './svc-leave-guard.js';
export default (host, config = {}, ctx) => {
    const el = host.ownerDocument.createElement('pk-record-page');
    const { load, save, mode, idParam = 'id', ...data } = config;
    data.id = data.id ?? ctx?.route?.params?.[idParam];
    el.config = data;
    if (mode) el.mode = mode;
    if (load) el.load = id => load(id, ctx);
    const win = host.ownerDocument.defaultView, guard = ctx?.dialogs && win && leaveGuard(win, () => ctx.dialogs.confirm({ heading: 'Leave without saving?', message: 'Your changes to this record will be lost.', confirmLabel: 'Leave', cancelLabel: 'Stay', danger: true }));
    // A save may navigate on its own (back to the list): that is not a leave, so the guard stands aside while save runs.
    if (save) el.save = async values => { guard?.busy(true); try { return await save(values, ctx); } finally { guard?.busy(false); } };
    guard && el.addEventListener('pk-record-dirty', e => guard.dirty(e.detail.dirty));
    const mounted = mountTitled(host, el, config.title), cleanup = () => { guard.destroy(); mounted(); };
    return guard ? Object.assign(cleanup, mounted.then && { then: (ok, no) => mounted.then(stop => ok(() => { guard.destroy(); stop(); }), no) }) : mounted;
};
