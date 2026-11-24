// The theme editor's "Audit gallery pages" (#107, step 4): on a button press, never while typing, each page the host lists is opened off-screen in both themes with the
// editor's override CSS adopted, the text it draws is measured against the colour it sits on (js/rendered-contrast.js), and every colour pair below AA is listed with
// the tokens behind each side and a jump to them. A page is { name, url } (same origin) or { name, links, body, script } (js/rendered-contrast.js openPageFrame). Built from SDK components.
import { collectTextBoxes, rateBoxes, tokensBehind, openPageFrame } from '../../js/rendered-contrast.js';
import { createLogger } from '../../js/log.js';
import { h, on as listen } from '../../js/mount-support.js';
const log = createLogger('theme-editor.audit');

const THEMES = ['dark', 'light'];
const JUMPS = 2;   // tokens listed per side; more than that is noise

/**
 * createAuditTab({ doc, win, pages, css, names, jump, settleMs }) -> { panel, run(), destroy() }.
 * css() is the override block as it stands; names are the colour token names to look the colours up in; jump(name, theme) shows a token in the Tokens tab.
 */
export function createAuditTab({ doc, win, pages, css, names, jump, settleMs = 600 }) {
    let gone = false;
    let running = false;
    const frames = new Set();
    const listeners = [];
    const button = h(doc, 'pk-button', { variant: 'primary', 'data-audit': 'run' }, 'Audit gallery pages');
    const status = h(doc, 'p', { class: 'muted', role: 'status', 'data-audit': 'status' }, `Measures the text ${pages.length === 1 ? 'of one page' : `of ${pages.length} pages`} in both themes with these edits. It runs when you press the button, not while you type.`);
    const results = h(doc, 'div', { class: 'te-pairs', 'data-audit': 'results' });
    const panel = h(doc, 'div', {}, h(doc, 'pk-cluster', {}, button), status, results);

    async function measurePage(page, theme) {
        const f = await openPageFrame(doc, win, page, { theme, css: css(), settleMs, title: `${page.name} (${theme}) for the audit` });
        frames.add(f);
        try {
            const fdoc = f.contentDocument;
            const value = n => win.getComputedStyle(fdoc.documentElement).getPropertyValue(n).trim();
            return rateBoxes(collectTextBoxes(fdoc)).map(g => ({ ...g, page: page.name, theme, fgTokens: tokensBehind(g.fg, names, value).slice(0, JUMPS), bgTokens: tokensBehind(g.bg, names, value).slice(0, JUMPS) }));
        } finally { f.remove(); frames.delete(f); }
    }

    const jumpButton = (name, theme) => h(doc, 'pk-button', { size: 'mini', variant: 'ghost', 'data-audit-jump': name, 'data-jump-theme': theme, label: `Go to ${name} in the ${theme} theme` }, name.replace(/^--/, ''));
    function paint(found, failed) {
        const summary = failed.length ? h(doc, 'pk-alert', { kind: 'danger' }, `${failed.length} page${failed.length === 1 ? '' : 's'} could not be audited: ${failed.join('; ')}`)
            : h(doc, 'pk-alert', { kind: found.length ? 'warning' : 'success' }, found.length ? `${found.length} colour pair${found.length === 1 ? '' : 's'} below AA on the gallery pages, worst first.` : 'No text below AA on the audited pages, in both themes.');
        results.replaceChildren(summary, ...found.map(r => h(doc, 'div', { class: 'te-pair te-audit-row', 'data-audit-row': `${r.page} ${r.theme} ${r.fg} ${r.bg}` },
            h(doc, 'pk-badge', { variant: 'danger' }, `${r.ratio.toFixed(2)}:1`),
            h(doc, 'span', { class: 'te-pair-name' }, `${r.page}, ${r.theme}: "${r.text}" ${r.count > 1 ? `and ${r.count - 1} more ` : ''}(${r.fg} on ${r.bg}, needs ${r.need}:1) in ${r.selector}`),
            h(doc, 'pk-cluster', { class: 'te-pair-jump' }, ...r.fgTokens.map(n => jumpButton(n, r.theme)), ...r.bgTokens.filter(n => !r.fgTokens.includes(n)).map(n => jumpButton(n, r.theme))))));
    }

    async function run() {
        if (running || gone) return null;
        running = true; button.setAttribute('disabled', '');
        const found = []; const failed = [];
        try {
            let n = 0;
            for (const page of pages) for (const theme of THEMES) {
                if (gone) return null;
                status.textContent = `Auditing ${++n} of ${pages.length * THEMES.length}: ${page.name}, ${theme}`;
                try { found.push(...await measurePage(page, theme)); } catch (error) { log.warn(`the page "${page.name}" could not be audited`, error); failed.push(`${page.name} (${theme})`); }
            }
            found.sort((a, b) => a.ratio - b.ratio);
            paint(found, failed);
            status.textContent = `Audited ${pages.length} page${pages.length === 1 ? '' : 's'} in both themes.`;
            return found;
        } finally { running = false; button.removeAttribute('disabled'); }
    }

    listeners.push(listen(button, 'click', () => { run().catch(error => log.warn('the audit failed', error)); }));
    listeners.push(listen(results, 'click', e => { const b = e.target.closest?.('[data-audit-jump]'); if (b) jump(b.dataset.auditJump, b.dataset.jumpTheme); }));
    return { panel, run, destroy() { gone = true; for (const off of listeners.splice(0)) off?.(); for (const f of frames) f.remove(); frames.clear(); } };
}
