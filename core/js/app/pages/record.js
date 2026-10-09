// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
// 'record' (#353): <pk-record-page>; config: { fields, sidebar, heading, saveLabel, editable, mode, idParam } as data, and the callbacks
// load(id, ctx) -> record, save(values, ctx) -> void | updated values (reject with { errors: { field: message } } for inline errors) and delete(id, ctx) (a Delete button, a confirm dialog, then the call).
// Outcome toasts are on by default (#855): Saved, Could not save, Deleted, Could not delete; config.toasts false or { saved, failed, deleted, deleteFailed } words or drops them (svc-page-toasts.js).
// The record id is the route param named config.idParam (default 'id'); with none the page is a new record.
// Unsaved edits are guarded (#872): leaving by a link, a breadcrumb or back/forward asks through ctx.dialogs.confirm first (js/app/pages/svc-leave-guard.js, loaded with this chunk, not the entry).
// PAGE_TYPE: read at build time by core/tools/audit/data.mjs (design section 3.2); not used at runtime.
export const PAGE_TYPE = {
    id: 'record',
    summary: 'A single record form: fields, sidebar, save.',
    configKeys: ['fields', 'sidebar', 'heading', 'saveLabel', 'editable', 'mode', 'idParam', 'load', 'save', 'delete', 'toasts'],
    states: [],
    useWhen: 'Viewing or editing one record identified by a route param, new or existing.',
};
import { mountTitled } from '../../page-shell.js';
import { leaveGuard } from './svc-leave-guard.js';
import { toaster } from './svc-page-toasts.js';
export default (host, config = {}, ctx) => {
    const el = host.ownerDocument.createElement('pk-record-page');
    const { load, save, delete: remove, mode, idParam = 'id', ...data } = config, toast = toaster(config, ctx);
    data.id = data.id ?? ctx?.route?.params?.[idParam];
    if (typeof remove === 'function') data.deletable = true;
    el.config = data;
    if (mode) el.mode = mode;
    if (load) el.load = id => load(id, ctx);
    const win = host.ownerDocument.defaultView, guard = ctx?.dialogs && win && leaveGuard(win, () => ctx.dialogs.confirm({ heading: 'Leave without saving?', message: 'Your changes to this record will be lost.', confirmLabel: 'Leave', cancelLabel: 'Stay', danger: true }));
    // A save may navigate on its own (back to the list): that is not a leave, so the guard stands aside while save runs.
    if (save) el.save = async values => { guard?.busy(true); try { const out = await save(values, ctx); toast('saved', values); return out; } catch (err) { toast('failed', err); throw err; } finally { guard?.busy(false); } };
    // Delete asks first (the dialog's own Cancel keeps the record), then calls delete(id, ctx); the app navigates away in it, as a save does.
    if (data.deletable) el.addEventListener('pk-record-delete', async () => {
        if (!(await ctx?.dialogs?.confirm({ heading: 'Delete this record?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
        try { await remove(data.id, ctx); toast('deleted'); } catch (err) { toast('deleteFailed', err); }
    });
    guard && el.addEventListener('pk-record-dirty', e => guard.dirty(e.detail.dirty));
    const mounted = mountTitled(host, el, config.title), cleanup = () => { guard.destroy(); mounted(); };
    return guard ? Object.assign(cleanup, mounted.then && { then: (ok, no) => mounted.then(stop => ok(() => { guard.destroy(); stop(); }), no) }) : mounted;
};
