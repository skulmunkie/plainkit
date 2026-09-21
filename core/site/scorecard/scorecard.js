// The SDK scorecard page: a thin host for the scorecard module (modules/scorecard) with every framework section on and this
// repository's own data. The module measures and draws; this file supplies what only the site knows: the scoring definitions, the
// gallery elements as targets, the stylesheets and scripts to weigh, the budgets, the reports the tools write, and the one check that
// belongs to the site's page templates (a workspace must fill the viewport).

import { mountShell } from '../shell.js';
import { SCORING, TEXT_PAIRS, PRIMARY_CSS, BUDGETS } from './scoring.data.js';
import { ELEMENTS } from '../gallery/gallery.data.js';
import { sampleDoc } from '../gallery/frame.js';
import { mountScorecard } from '../../modules/scorecard/scorecard.js';

const here = path => new URL(path, import.meta.url).href;

// Every element is a target: its examples are rendered at every theme and width and scored together.
const elementTargets = () => ELEMENTS.map(m => ({ id: m.tag, name: m.title, kind: m.group || 'Other', samples: m.examples.map(x => ({ srcdoc: ({ theme }) => sampleDoc(x.html, { theme }) })) }));

// Every template that claims the viewport must reach its bottom edge (minus the footer strip) at each size.
const VIEWPORTS = [[1280, 800], [1920, 1080], [375, 812]];
async function workspaceFill({ host }) {
    const failures = [];
    for (const [w, h] of VIEWPORTS) {
        const f = document.createElement('iframe');
        f.style.cssText = `position:fixed;left:-20000px;top:0;width:${w}px;height:${h}px;border:0`;
        f.src = '../../samples/templates/workspace/workspace.html?nav=side';
        host.append(f);
        await new Promise(r => f.addEventListener('load', () => setTimeout(r, 400), { once: true }));
        const d = f.contentDocument; const ws = d.querySelector('pk-workspace, .workspace'); const foot = d.querySelector('[slot="footer"], .shell-footer');
        const bottom = ws.getBoundingClientRect().bottom; const want = h - (foot?.getBoundingClientRect().height ?? 0);
        const scroll = d.documentElement.scrollHeight > h + 1;
        if (bottom < want - 2 || scroll) failures.push({ w, h, bottom: Math.round(bottom), want: Math.round(want), pageScroll: scroll });
        f.remove();
    }
    if (!failures.length) return [];
    return [{ id: 'workspace-fill', name: 'Workspace fills the viewport', kind: 'Page templates', findings: failures.map(x => ({ check: 'workspace-fill', severity: 'error', category: 'look', selector: `${x.w}x${x.h}`, message: JSON.stringify(x), count: 1, contexts: [] })), score: 0 }];
}

// The page-level sheets and every element's css.
async function stylesheetFiles() {
    const registry = (await import('../../elements/registry.js')).default;
    return Object.fromEntries([...PRIMARY_CSS, ...Object.keys(registry).map(tag => `elements/${tag.slice(3)}/${tag.slice(3)}.css`)].map(n => [n, here(`../../${n}`)]));
}
const SCRIPTS = ['theme', 'colour', 'quality', 'scoring', 'audit', 'plainkit', 'code-explorer/element', 'code-explorer/providers', 'code-explorer/tokenize'];
const scriptFiles = () => Object.fromEntries(SCRIPTS.map(n => [n, here(`../../js/${n}.js`)]));

// What the size section weighs: the built files in dist/, each against the budget of tests/budgets.test.mjs.
async function sizeFiles() {
    const res = await fetch(here('../../dist/manifest.json'));
    if (!res.ok) return [];
    const { files } = await res.json();
    const dist = p => here(`../../dist/${p}`);
    const modules = ['js/theme', 'js/colour', 'js/quality', 'js/scoring', 'js/audit', 'js/plainkit', 'js/code-explorer/element', 'js/code-explorer/providers', 'js/code-explorer/tokenize'];
    const base = ['js/plainkit', 'js/invokers', 'js/log', 'js/loader', 'js/theme', 'js/colour', 'js/dynamic'];
    return [
        { name: 'plainkit.css (page layer)', url: dist('plainkit.css'), budget: 'pageCssGzKb' },
        ...files.map(f => f.path).filter(p => /^elements\/[^/]+\.js$/.test(p) && p !== 'elements/registry.js').map(p => ({ name: p, url: dist(p), budget: 'elementGzKb' })),
        { name: 'element base runtime (comments stripped)', urls: ['../../js/element.js', '../../js/element-core.js'].map(here), strip: true, budget: 'baseRuntimeGzKb' },
        ...modules.map(m => ({ name: `${m}.js`, url: here(`../../${m}.js`), budget: 'jsModuleGzKb' })),
        { name: 'base script set (what a plain page imports)', urls: base.map(m => here(`../../${m}.js`)), budget: 'baseJsGzKb' },
    ];
}

async function main() {
    mountShell({ page: 'scorecard', title: 'Scorecard' });
    const root = document.querySelector('#sc-root');
    const intro = document.createElement('p');
    intro.className = 'muted';
    intro.textContent = `Scores 0-100 for performance, scale, look and accessibility, from the definitions in scorecard/scoring.data.js (every threshold is a setting there). A run renders every gallery sample at ${SCORING.widths.join(', ')}px in both themes, so it takes a little while.`;
    const host = document.createElement('div');
    root.replaceChildren(intro, host);
    await mountScorecard(host, {
        sections: ['ranked', 'performance', 'size', 'api', 'sweep', 'security', 'history'],
        targets: elementTargets(),
        historyKey: SCORING.historyKey,
        historyMax: SCORING.historyMax,
        link: i => `../gallery/index.html#/elements/${i.id}`,
        rankedLabel: 'Element',
        fileLink: (file, line) => `../files/index.html#path=${encodeURIComponent(file)}&line=${line}`,
        extraItems: workspaceFill,
        data: {
            scoring: SCORING,
            budgets: BUDGETS,
            sizes: await sizeFiles().catch(() => []),
            files: {
                css: await stylesheetFiles(), js: scriptFiles(), tokens: 'tokens/tokens.css', pairs: TEXT_PAIRS,
                frame: { srcdoc: () => sampleDoc(ELEMENTS.map(m => m.examples.map(x => x.html).join('')).join(''), { theme: 'dark' }) },
                unusedIn: ['base/utilities', 'base/spacing'],
            },
            security: here('security-report.json'),
            apiBaseline: here('api.baseline.json'),
            api: here('api.current.json'),
            sweep: here('sweep-report.json'),
        },
    });
}

main().catch(err => {
    const n = document.createElement('pk-alert');
    n.setAttribute('kind', 'danger');
    n.className = 'gx-notice-file';
    n.textContent = `The scorecard could not start: ${err.message}. Serve the Plainkit folder with a static server.`;
    document.body.append(n);
});
