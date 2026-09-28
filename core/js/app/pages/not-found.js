// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
// 'not-found' (#351): <pk-not-found-page>. A route's page: 'not-found' bypasses this (app/host.js's showPage calls box.notFound() directly);
// this factory only serves mountPage()/a 'custom' module. config: { heading, description, label, action(ctx) }, like 'states'' retry.
export default (host, config = {}, ctx) => {
    const el = host.ownerDocument.createElement('pk-not-found-page');
    for (const k of ['heading', 'description', 'label']) if (config[k] !== undefined) el[k] = config[k];
    const onAction = () => config.action?.(ctx);
    if (config.action) el.addEventListener('pk-action', onAction);
    host.append(el);
    return () => { if (config.action) el.removeEventListener('pk-action', onAction); el.remove(); };
};
