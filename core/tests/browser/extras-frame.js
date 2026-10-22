// A core-only folder, simulated: the shipped (by-name) loader runs against a registry that has no element modules beside it (extras-core-only/elements/registry.js),
// which is what an unzipped plainkit-<v>.zip without the extras gives. The log lines it writes are collected for the case.
const logs = (window.logs = []);
for (const level of ['error', 'warn']) { const real = console[level]; console[level] = (...args) => { logs.push({ level, text: args.map(String).join(' ') }); real.apply(console, args); }; }
const { loadElements } = await import('../../dist/js/loader.js');
await loadElements(document, { registry: new URL('./extras-core-only/elements/registry.js', import.meta.url).href });
window.ready = true;
