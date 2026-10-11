// The reference pages for the wire benchmark and the page-weight ratchet (core/tests/page-weight.test.mjs): the smallest honest page for each of
// three common jobs, wired the recommended way (min CSS, the small entry, modulepreload hints). Plain data, no browser: both users read it.
import { shell } from './lib.mjs';

const PRELOAD = ['/dist/js/loader.js', '/dist/js/log.js', '/dist/elements/registry.js', '/dist/js/element.js', '/dist/js/element-core.js'];
const head = PRELOAD.map(f => `<link rel="modulepreload" href="${f}">`).join('');
// Every pk-* on the page is defined and has had two frames to render when window.__marks is set: the wire bench reads it.
const script = `import { initPlainkit } from '/dist/js/init.js'; initPlainkit();
const tags = [...new Set([...document.querySelectorAll('*')].map(e => e.localName).filter(n => n.startsWith('pk-')))];
await Promise.all(tags.map(t => customElements.whenDefined(t)));
await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
window.__marks = { upgraded: performance.now(), notUpgraded: document.querySelectorAll(':not(:defined)').length };`;

const bodies = {
    button: '<pk-button variant="primary">Save</pk-button>',
    form: `<form><pk-field label="Name"><pk-input name="name" required></pk-input></pk-field>
<pk-field label="Plan"><pk-select name="plan"><option>Free</option><option>Team</option></pk-select></pk-field>
<pk-checkbox name="terms" required>I agree to the terms</pk-checkbox>
<pk-button type="submit" variant="primary">Send</pk-button></form>`,
    table: `<pk-table label="Products" striped columns='[{"key":"sku","label":"SKU","sortable":true},{"key":"price","label":"Price","type":"number","sortable":true}]' rows='[{"id":1,"sku":"AC-001","price":"4.99"},{"id":2,"sku":"AC-002","price":"3.99"}]'></pk-table>`,
};

export const REF_PAGES = Object.fromEntries(Object.entries(bodies).map(([name, body]) => [name, { path: `/__bench/ref-${name}.html`, html: shell({ head, body, script }) }]));
