// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
// 'workspace' (#353): <pk-workspace-page>; config: panes, labels, fill, mount(panes, ctx) (callback: cleanup | { destroy() }).
export default (host, config = {}, ctx) => {
    const el = host.ownerDocument.createElement('pk-workspace-page');
    const { mount, fill, ...data } = config;
    el.config = data;
    if (fill) el.fill = true;
    if (mount) el.mount = panes => mount(panes, ctx);
    host.append(el);
    return () => el.remove();
};
