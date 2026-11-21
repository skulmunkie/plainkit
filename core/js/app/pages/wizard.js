// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
// 'wizard' (#353): <pk-wizard-page>; config: { steps, review, reviewLabel, submitLabel, doneHeading, doneDescription } as data, and the callbacks
// validate(stepId, values, ctx, { live, key }? (the last when config.liveValidate runs it on a committed answer)), submit(values, ctx), load(ctx) -> draft answers and mountStep(pane, step, ctx) for a step without fields
// (reject or return { errors: { field: message } } from validate or submit for inline errors).
// PAGE_TYPE: read at build time by core/tools/audit/data.mjs (design section 3.2); not used at runtime.
export const PAGE_TYPE = {
    id: 'wizard',
    summary: 'A multi-step flow with per-step validation, a review step and one submit.',
    configKeys: ['steps', 'review', 'reviewLabel', 'submitLabel', 'doneHeading', 'doneDescription', 'validate', 'submit', 'load', 'mountStep'],
    states: ['done'],
    useWhen: 'A sequence of steps that must be completed in order before one submit.',
};
import { definePage } from '../../page-define.js';
export default definePage({
    tag: 'pk-wizard-page',
    data: ({ validate, submit, load, mountStep, ...data }) => data,
    wire: (el, { validate, submit, load, mountStep }, ctx) => {
        if (validate) el.validate = (id, values, opts) => validate(id, values, ctx, opts);
        if (submit) el.submit = values => submit(values, ctx);
        if (load) el.load = () => load(ctx);
        if (mountStep) el.mountStep = (pane, step) => mountStep(pane, step, ctx);
    },
});
