// The dev tools workspace module (issue 1582, step 1): mountDevToolsWorkspace puts the Gallery, Files and Scorecard tabs and the tool dock in one call, loading each workspace
// on first use. Measuring cases: the tabs switch and lazy-load, a deep link opens straight on one workspace and dock tab, data handed over later (update) reaches the page, a
// workspace with no data says so, and the tab strip fits a phone. Same shape as cases.js.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what) => { for (let i = 0; i < 150; i++) { const v = fn(); if (v) return v; await wait(100); } throw new Error(`timed out waiting for ${what}`); };
const dist = () => import(new URL('../../dist/modules/devtools/workspace.js', import.meta.url).href);

const SNAPSHOT = { version: 1, files: [
    { path: 'src/app.js', language: 'js', content: 'export function run() {\n  return 42;\n}\n', symbols: [{ kind: 'function', name: 'run', line: 1, depth: 0 }] },
    { path: 'README.md', language: 'md', content: '# Title\nsome text\n' },
] };
const TARGETS = [{ name: 'Card', html: '<p>Fine</p>' }];
const SECTIONS = [{ tag: 'pk-button', title: 'Blazor', lines: ['<PkButton />'] }];
const base = { dock: false, gallery: { sections: SECTIONS, height: 400 }, files: { snapshot: SNAPSHOT, file: 'src/app.js' }, scorecard: { targets: TARGETS, themes: ['dark'], widths: [375] } };
const body = host => host.querySelector('[data-devtools-workspace]');
const choose = (host, key) => host.querySelector(`pk-tab[value="${key}"]`).click();

export const devtoolsWorkspaceCases = [
    ['devtools workspace: opens on the gallery with the sections handed in, and the files and scorecard modules are not loaded until their tab is chosen', async t => {
        const { mountDevToolsWorkspace } = await dist(); const open = async (h, o) => { const p = await mountDevToolsWorkspace(h, o); await p.ready; return p; };
        const host = t.stage('');
        const before = () => performance.getEntriesByType('resource').filter(e => /code-explorer\/code-explorer\.js|scorecard\/scorecard\.js/.test(e.name)).length;
        const loaded = before();
        const page = await open(host, base);
        try {
            t.eq([...host.querySelectorAll('pk-tab')].map(x => x.textContent.trim()).join(), 'Gallery,Files,Scorecard', 'the three workspaces are offered');
            t.eq(page.workspace(), 'gallery', 'the gallery is first');
            const gallery = await until(() => host.querySelector('pk-gallery'), 'pk-gallery');
            t.eq(gallery.getAttribute('chrome'), 'full', 'the gallery has its full chrome');
            t.eq(JSON.parse(gallery.getAttribute('sections'))[0].title, 'Blazor', 'the sections went to the gallery');
            t.eq(before() - loaded, 0, 'neither the explorer nor the scorecard module was requested yet');
        } finally { page.destroy(); }
    }],
    ['devtools workspace: choosing Files mounts the code explorer on the snapshot, Scorecard mounts the scorecard, and each replaces the one before; the host hears the choice', async t => {
        const { mountDevToolsWorkspace } = await dist(); const open = async (h, o) => { const p = await mountDevToolsWorkspace(h, o); await p.ready; return p; };
        const host = t.stage('');
        const heard = [];
        const page = await open(host, { ...base, onworkspace: k => heard.push(k) });
        try {
            choose(host, 'files');
            const explorer = await until(() => host.querySelector('pk-code-explorer'), 'pk-code-explorer');
            t.eq(body(host).dataset.devtoolsWorkspace, 'files', 'the body names the workspace');
            t.eq(host.querySelector('pk-gallery'), null, 'the gallery is gone');
            await until(() => /return 42/.test(explorer.shadowRoot?.textContent ?? '') || /app\.js/.test(explorer.textContent + (explorer.shadowRoot?.textContent ?? '')), 'the snapshot file in the explorer');
            choose(host, 'scorecard');
            await until(() => host.querySelector('pk-code-explorer') === null && body(host).querySelector('pk-button'), 'the scorecard in place of the explorer');
            t.eq(body(host).dataset.devtoolsWorkspace, 'scorecard', 'the body names the workspace');
            t.eq(host.querySelector('pk-tabs').getAttribute('value'), 'scorecard', 'the tab follows');
            t.eq(heard.join(), 'files,scorecard', 'onworkspace heard what the reader chose');
            await page.select('gallery');
            t.eq(heard.join(), 'files,scorecard', 'select() from code is not reported back to the host');
            await until(() => host.querySelector('pk-gallery'), 'the gallery again');
        } finally { page.destroy(); }
    }],
    ['devtools workspace: a deep link opens on its workspace and dock tab, requests only that workspace, and the dock is the one tool-dock', async t => {
        const { mountDevToolsWorkspace } = await dist(); const open = async (h, o) => { const p = await mountDevToolsWorkspace(h, o); await p.ready; return p; };
        const host = t.stage('');
        const page = await open(host, { ...base, dock: true, workspace: 'scorecard', tool: 'logs' });
        try {
            t.eq(page.workspace(), 'scorecard', 'opened on the scorecard');
            t.eq(host.querySelector('pk-tabs').getAttribute('value'), 'scorecard', 'the tab shows it');
            t.eq(host.querySelector('pk-gallery'), null, 'no gallery was built');
            t.eq(host.querySelector('pk-code-explorer'), null, 'no explorer was built');
            t.ok(page.dock?.isOpen(), 'the dock is open');
            const dockTabs = [...document.querySelectorAll('pk-tray pk-tabs')].find(x => x.getAttribute('label') === 'Dev tools');
            t.eq(dockTabs?.getAttribute('value'), 'logs', 'the dock is on the requested tool tab');
        } finally { page.destroy(); }
        t.eq([...document.querySelectorAll('pk-tray')].filter(x => x.getAttribute('label') === 'Dev tools').length, 0, 'destroy removed the dock');
    }],
    ['devtools workspace: an unknown workspace falls back to the first one, and a workspace with no data says so instead of mounting nothing', async t => {
        const { mountDevToolsWorkspace } = await dist(); const open = async (h, o) => { const p = await mountDevToolsWorkspace(h, o); await p.ready; return p; };
        const host = t.stage('');
        const page = await open(host, { dock: false, workspace: 'nope', workspaces: ['files', 'scorecard'] });
        try {
            t.eq(page.workspace(), 'files', 'fell back to the first offered workspace');
            t.eq(host.querySelectorAll('pk-tab').length, 2, 'only the offered tabs');
            const empty = await until(() => host.querySelector('pk-empty-state'), 'the files empty state');
            t.eq(empty.getAttribute('heading'), 'No source to browse', 'the files empty state names the problem');
            await page.select('scorecard');
            t.eq((await until(() => host.querySelector('pk-empty-state'), 'the scorecard empty state')).getAttribute('heading'), 'Nothing to score', 'the scorecard empty state names the problem');
        } finally { page.destroy(); }
    }],
    ['devtools workspace: update() hands data over after mounting, and a load that fails shows the problem while the tabs keep working', async t => {
        const { mountDevToolsWorkspace } = await dist(); const open = async (h, o) => { const p = await mountDevToolsWorkspace(h, o); await p.ready; return p; };
        const host = t.stage('');
        const page = await open(host, { dock: false, workspace: 'files' });
        try {
            await until(() => host.querySelector('pk-empty-state'), 'the empty state');
            await page.update({ files: { snapshot: SNAPSHOT, count: 2 } });
            await until(() => host.querySelector('pk-code-explorer'), 'the explorer after update');
            t.ok(/2 files/.test(body(host).textContent), 'the file count is shown');
            await page.update({ files: { snapshot: null, load: async () => { throw new Error('the reader is gone'); } } });
            const failed = await until(() => host.querySelector('pk-empty-state'), 'the failure state');
            t.ok(/reader is gone/.test(failed.getAttribute('description')), 'the failure is named');
            t.eq(host.querySelectorAll('pk-tab').length, 3, 'the tabs are still there');
        } finally { page.destroy(); }
    }],
    ['devtools workspace: destroy leaves the container empty and a slow load that finishes afterwards paints nothing', async t => {
        const { mountDevToolsWorkspace } = await dist(); const open = async (h, o) => { const p = await mountDevToolsWorkspace(h, o); await p.ready; return p; };
        const host = t.stage('');
        let release;
        const page = await mountDevToolsWorkspace(host, { dock: false, workspace: 'files', files: { load: () => new Promise(r => { release = r; }) } });
        page.destroy();
        t.eq(host.childElementCount, 0, 'nothing left in the container');
        release(null);
        await wait(200);
        t.eq(host.childElementCount, 0, 'the late load painted nothing');
    }],
    ['devtools workspace: on a phone the tab strip and the workspace fit the width', async t => {
        const { mountDevToolsWorkspace } = await dist(); const open = async (h, o) => { const p = await mountDevToolsWorkspace(h, o); await p.ready; return p; };
        const host = t.stage('');
        const holder = document.createElement('div');
        holder.style.width = '375px';
        host.append(holder);
        const page = await open(holder, { ...base, workspace: 'files' });
        try {
            await until(() => holder.querySelector('pk-code-explorer'), 'the explorer');
            await wait(300);
            const w = holder.getBoundingClientRect().width;
            for (const el of [holder.querySelector('pk-tabs'), body(holder), holder.querySelector('pk-code-explorer')]) {
                const r = el.getBoundingClientRect();
                t.ok(r.right <= holder.getBoundingClientRect().right + 1 && r.width <= w + 1, `${el.localName} fits 375px (${Math.round(r.width)})`);
            }
        } finally { page.destroy(); }
    }],
];
