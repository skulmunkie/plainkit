// pk-workspace-page (#353): the three panes filled by the consumer's mount(panes), then the error state (a danger alert with Retry over the panes) when mount() rejects.
// The element is wired in setup(): a button flips a flag and re-sets config, which mounts again, like a consumer whose backend went down.
const WS = 'pk-workspace-page';
const MAIN = `${WS} >>> [part=main]`;

export default {
    name: 'workspace-page',
    elements: ['workspace-page', 'workspace', 'alert', 'page-header', 'breadcrumb', 'button'],
    html: '<pk-stack gap="md"><pk-button id="fail" variant="secondary" size="sm">Make mount fail</pk-button><pk-workspace-page></pk-workspace-page></pk-stack>',
    setup(frame) {
        const el = frame.querySelector('pk-workspace-page');
        let failing = false;
        const draw = (pane, text) => { const p = frame.ownerDocument.createElement('p'); p.textContent = text; pane.append(p); };
        el.mount = panes => {
            if (failing) throw new Error('The backend did not answer.');
            draw(panes.nav, 'Nav pane'); draw(panes.main, 'Main pane'); draw(panes.aside, 'Aside pane');
            return () => {};
        };
        el.config = { heading: 'Orders', breadcrumb: [{ label: 'Home', href: '#' }, { label: 'Orders', href: '#' }], actions: [{ key: 'export', label: 'Export', variant: 'secondary' }], panes: ['nav', 'aside'], navLabel: 'Files', mainLabel: 'Editor', asideLabel: 'Outline' };
        frame.querySelector('#fail').addEventListener('click', () => { failing = true; el.config = { ...el.config }; });
    },
    steps: [
        { wait: 400 }, { shot: 'panes' },
        { click: '#fail' }, { wait: 400 }, { shot: 'error' },
    ],
    expect(t) {
        t.inViewport(WS);
        t.visible(`${WS} >>> [part=header] pk-page-header`, 'the shared title bar');
        t.noOverlap(`${WS} >>> [part=header]`, `${WS} >>> pk-workspace`);
        if (t.shot === 'panes') {
            t.hasText(MAIN, 'Main pane');
            t.absent(`${WS} >>> [part=state] pk-alert`);
            if (t.viewport.name === 'desktop') {
                t.noOverlap(`${WS} >>> [part=nav]`, MAIN);
                t.noOverlap(MAIN, `${WS} >>> [part=aside]`);
            }
        }
        if (t.shot === 'error') {
            t.visible(`${WS} >>> [part=state] pk-alert`, 'the error alert');
            t.hasText(`${WS} >>> [part=state] pk-alert`, 'did not answer');
            t.visible(`${WS} >>> [part=state] pk-button`, 'the Retry button');
            t.within(`${WS} >>> [part=state] pk-alert`, WS, 1);
        }
    },
};
