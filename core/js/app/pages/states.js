// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
// 'states' (#351): <pk-states-page> (loading/empty/error/forbidden, or its own content when ready). config: { state, heading, description,
// label, retry }; retry is wired to the element's pk-retry event (elements talk back via events, not callback props - STANDARDS.md).
// PAGE_TYPE: read at build time by core/tools/audit/data.mjs (design section 3.2); not used at runtime.
export const PAGE_TYPE = {
    id: 'states',
    summary: 'Loading, empty, error or forbidden placeholder view, or ready content.',
    configKeys: ['state', 'heading', 'description', 'label', 'retry'],
    states: ['loading', 'empty', 'error', 'forbidden'],
    useWhen: "A route whose content depends on an async state that is not yet the list or record shape.",
};
import { mountTitled } from '../../page-shell.js';
// The page title when no heading is configured: the state's own default heading (loading and ready show their own content, so none).
const DEFAULT_TITLE = { empty: 'Nothing here yet', error: 'Something went wrong', forbidden: 'Not allowed' };
export default (host, config = {}, ctx) => {
    const el = host.ownerDocument.createElement('pk-states-page');
    for (const k of ['state', 'heading', 'description', 'label']) if (config[k] !== undefined) el[k] = config[k];
    const onRetry = () => config.retry?.(ctx);
    if (config.retry) el.addEventListener('pk-retry', onRetry);
    const done = mountTitled(host, el, config.heading || DEFAULT_TITLE[config.state]);
    return Object.assign(() => { if (config.retry) el.removeEventListener('pk-retry', onRetry); done(); }, { then: done.then });
};
