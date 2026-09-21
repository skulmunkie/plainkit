import { mountChrome } from '../chrome.js';
mountChrome({ title: "Workspace", page: "workspace", crumbs: [], actions: "", fill: true });

// The inspector is the workspace's docked aside; its toggle and its close button keep asideOpen and the pressed state together.
const workspace = document.getElementById('content');
const toggle = document.getElementById('inspector-toggle');
toggle.addEventListener('pk-toggle', e => { workspace.asideOpen = e.detail.pressed; });
document.getElementById('inspector-close').addEventListener('click', () => { workspace.asideOpen = false; toggle.pressed = false; });

// Closing a tab removes it and its panel; the strip then selects a neighbour.
const tabs = document.querySelector('pk-tabs');
tabs.addEventListener('pk-tab-close', e => {
    const tab = e.target.closest('pk-tab');
    const panel = tabs.querySelector('pk-tab-panel[value="' + tab.value + '"]');
    const all = [...tabs.querySelectorAll('pk-tab')];
    const neighbour = all[all.indexOf(tab) + 1] ?? all[all.indexOf(tab) - 1];
    tab.remove(); panel?.remove();
    if (neighbour) tabs.value = neighbour.value;
});
