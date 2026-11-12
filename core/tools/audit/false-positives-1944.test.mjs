// Conformance-audit false positives left after #1669/#1670 (#1944): B3 knows the public components that have no pk-* mapping, and B4 reads past framework head
// components and treats a navigation-only error page as static. Each case also keeps the true positive next to it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFiles } from '../strict/engine.mjs';
import './rules.mjs';

const run = (files, rule) => checkFiles(files, { ruleset: 'consumer' }).filter(f => f.rule === rule);
const home = { path: 'Home.razor', text: '@page "/"\n@inherits HomePageBase\n<PkTable></PkTable>' };

test('B3 knows PkReconnect and PkScripts (public components without a pk-* mapping) and still flags a made-up one (#1944)', () => {
    const ok = run([{ path: 'App.razor', text: '<body>\n<Routes />\n<PkReconnect />\n<PkScripts />\n</body>' }], 'B3');
    assert.deepEqual(ok, [], `FIX: B3 flagged a shipped component: ${JSON.stringify(ok)}`);
    const bad = run([{ path: 'App.razor', text: '<PkNoSuchThing />' }], 'B3');
    assert.equal(bad.length, 1, 'FIX: B3 must still flag an unknown component');
});

test('B4 reads past PageTitle, HeadContent and SectionContent to the page component (#1944)', () => {
    const files = [home,
        { path: 'Things.razor', text: '@page "/things"\n<PageTitle>Things</PageTitle>\n<PkListPage TItem="Thing" Config="_config" />' },
        { path: 'Head.razor', text: '@page "/head"\n<HeadContent><meta name="x" /></HeadContent>\n<SectionContent SectionName="s"><b>x</b></SectionContent>\n<PkRecordPage Load="LoadAsync" />' },
        { path: 'Other.razor', text: '@page "/other"\n<PageTitle>Other</PageTitle>\n<PkTable></PkTable>' }];
    assert.deepEqual(run(files, 'B4').map(f => f.file), ['Other.razor'], 'FIX: B4 should skip head components and fire only on Other.razor');
});

test('B4: a not-found or error page whose only service is NavigationManager and whose handler navigates is still static (#1944)', () => {
    const files = [home,
        { path: 'NotFound.razor', text: '@page "/not-found"\n@inject NavigationManager Nav\n<PkNotFoundPage Label="Back" OnAction="@(() => Nav.NavigateTo("/"))" />' },
        { path: 'Err.razor', text: '@page "/error"\n@inject NavigationManager Nav\n<h1>Oops</h1>\n<PkButton OnClick="@(() => Nav.NavigateTo("/", true))">Retry</PkButton>' },
        { path: 'Loads.razor', text: '@page "/error"\n@inject NavigationManager Nav\n@inject IOrders Orders\n<h1>Oops</h1>' },
        { path: 'Saves.razor', text: '@page "/not-found"\n@inject NavigationManager Nav\n<PkButton OnClick="@Save">Go</PkButton>' }];
    assert.deepEqual(run(files, 'B4').map(f => f.file).sort(), ['Loads.razor', 'Saves.razor'], 'FIX: B4 should skip the navigation-only error pages and keep the others');
});
