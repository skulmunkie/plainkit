// Default outcome toasts of the page types (#855), through ctx.notify (the one pk-toast-stack; js/notify.js). Lazy, with the page type that imports it.
//   const toast = toaster(config, ctx);  toast('saved', values);  toast('failed', error);
// Outcomes: saved, failed, deleted, deleteFailed (record), done, bulkFailed (list bulk). config.toasts: absent or true = the defaults below; false = none; an object words
// or drops one outcome: { saved: 'Order saved', failed: false, deleted: (detail, ctx) => 'Gone', failed: err => ({ title: 'No', details: err.message }) }. No notify service in the ctx
// (mountPage) means nothing is shown and nothing throws. A field error ({ errors }) is the field's, never a toast.
const DEFAULTS = { saved: ['success', 'Saved'], failed: ['error', 'Could not save'], deleted: ['success', 'Deleted'], deleteFailed: ['error', 'Could not delete'], done: ['success', 'Done'], bulkFailed: ['error', 'Could not complete'] };
export const toaster = (config, ctx) => (outcome, detail) => {
    const setting = config?.toasts, notify = ctx?.notify;
    if (setting === false || !notify || detail?.errors) return;
    const [kind, title] = DEFAULTS[outcome];
    let t = setting && typeof setting === 'object' ? setting[outcome] : undefined;
    if (typeof t === 'function') t = t(detail, ctx);
    if (t === false) return;
    notify[kind](typeof t === 'string' ? t : t?.title ?? title, t?.details ?? (kind === 'error' ? detail?.message : undefined));
};
