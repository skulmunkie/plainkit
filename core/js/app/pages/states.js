// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
// 'states' (#351): <pk-states-page> (loading/empty/error/forbidden, or its own content when ready). config: { state, heading, description,
// label, retry }; retry is wired to the element's pk-retry event (elements talk back via events, not callback props - STANDARDS.md).
export default (host, config = {}, ctx) => {
    const el = host.ownerDocument.createElement('pk-states-page');
    for (const k of ['state', 'heading', 'description', 'label']) if (config[k] !== undefined) el[k] = config[k];
    const onRetry = () => config.retry?.(ctx);
    if (config.retry) el.addEventListener('pk-retry', onRetry);
    host.append(el);
    return () => { if (config.retry) el.removeEventListener('pk-retry', onRetry); el.remove(); };
};
