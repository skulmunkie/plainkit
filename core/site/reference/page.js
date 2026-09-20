import { initOverlays } from '../../components/modal/modal.js';
import { initTabs } from '../../components/tabs/tabs.js';

const panes = {
    buttons: `
        <div class="cluster cluster--horizontal cluster--gap-sm cluster--align-center cluster--justify-start">
            <button type="button" class="btn-primary">Primary</button>
            <button type="button" class="btn-ghost">Ghost</button>
            <button type="button" class="btn-warn">Warn</button>
            <button type="button" class="btn-secondary">Secondary</button>
            <button type="button" class="btn-primary" disabled>Disabled</button>
        </div>
        <div class="cluster cluster--horizontal cluster--gap-sm cluster--align-center cluster--justify-start u-mt-3">
            <button type="button" class="btn-mini btn-primary">Mini</button>
            <button type="button" class="btn-mini btn-ghost">Ghost</button>
            <button type="button" class="btn-mini btn-warn">Warn</button>
            <a class="btn-primary" href="#">Link as button</a>
        </div>`,
    chips: `
        <div class="cluster cluster--horizontal cluster--gap-sm cluster--align-center cluster--justify-start">
            <span class="chip">Default</span>
            <span class="chip chip-success">Registered</span>
            <span class="chip chip-warn">Warn</span>
            <span class="chip chip-muted">Pending</span>
            <span class="chip chip-danger">Danger</span>
            <span class="chip chip-info">PO open</span>
            <button type="button" class="chip chip-btn chip-accent">Clickable</button>
        </div>`,
    notices: `
        <div class="notice">Error text, the default.</div>
        <div class="notice notice--warning">Warning text.</div>
        <div class="notice notice--success">Success text.</div>
        <div class="notice notice--info">Info text.</div>
        <div class="notice notice--boxed notice--warning"><strong class="notice-title">Heads up.</strong>Boxed banner.</div>`,
    tabs: `
        <div class="tabs" role="tablist" data-pk-tabs="toggle">
            <button type="button" class="tab active" role="tab" aria-selected="true" tabindex="0">Overview</button>
            <button type="button" class="tab" role="tab" aria-selected="false" tabindex="-1">Orders <span class="muted">(4)</span></button>
            <button type="button" class="tab" role="tab" aria-selected="false" tabindex="-1">Notes</button>
            <button type="button" class="tab-close" aria-label="Close Notes" title="Close">&#10005;</button>
        </div>
        <p class="muted">Arrow keys, Home and End move between tabs.</p>`,
    cards: `
        <section class="card">
            <div class="card-header"><h2>Card title</h2><span class="muted">metadata</span></div>
            <p>Card body. Panel background, border and shadow come from tokens.</p>
        </section>
        <div class="empty-state">
            <p class="empty-state-title">Nothing here yet</p>
            <p class="empty-state-description">An empty state says what is missing and what to do.</p>
            <div class="empty-state-actions"><button type="button" class="btn-mini btn-primary">Add one</button></div>
        </div>
        <p class="muted loading" role="status" aria-live="polite">Loading&hellip;</p>`,
    forms: `
        <div class="form-row">
            <label class="ff"><span>Name <span class="ff-required" aria-hidden="true">*</span></span><input type="text" value="Widget 1"></label>
            <label class="ff"><span>Status <span class="ff-hint">- optional</span></span><select><option>Active</option><option>Draft</option></select></label>
        </div>
        <label class="chk"><input type="checkbox" checked><span>Track inventory</span></label>
        <p class="form-error">This is a form error.</p>`,
    tables: `
        <div class="u-scroll-x">
            <table class="data">
                <thead><tr><th>SKU</th><th>Title</th><th class="num">Price</th></tr></thead>
                <tbody>
                    <tr><td><code>AC-001</code></td><td>Widget 1</td><td class="num">$4.99</td></tr>
                    <tr><td><code>AC-002</code></td><td>Widget 2</td><td class="num">$3.99</td></tr>
                </tbody>
            </table>
        </div>`,
};

for (const [id, html] of Object.entries(panes)) {
    document.getElementById(id).innerHTML = ['dark', 'light']
        .map(theme => `<div class="ref-pane" data-theme="${theme}"><h4>${theme}</h4>${html}</div>`).join('');
}

document.getElementById('toggle-theme').addEventListener('click', () => {
    const root = document.documentElement;
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
});

const backdrop = document.getElementById('demo-flyout-backdrop');
const flyout = document.getElementById('demo-flyout');
new MutationObserver(() => { backdrop.hidden = flyout.hidden; }).observe(flyout, { attributes: true, attributeFilter: ['hidden'] });

initOverlays();
initTabs();
