// Browser cases for issue 1344: an element that watches a slot AND renders fallback text inside it must not write the shadow tree when
// nothing changed, or WebKit (which fires slotchange for a rewritten fallback) re-renders forever. Same contract as cases.js: [name, async (t) => void].
const wait = ms => new Promise(r => setTimeout(r, ms));

const CASES = [['pk-empty-state', 'heading="Nothing yet" description="Add one"', 'heading'], ['pk-field-list', 'heading="Details"', 'heading']];

export const slotchangeLoopCases = CASES.map(([tag, attrs, slot]) => [`${tag}: repeated slotchange on a watched slot with fallback text writes nothing and renders a bounded number of times`, async t => {
    const el = await t.mount(`<${tag} ${attrs}></${tag}>`);
    await t.load(el.shadowRoot); await t.settle(); await wait(100);
    let renders = 0; const render = el.render; el.render = function () { renders++; return render.call(this); };
    let writes = 0; const mo = new MutationObserver(r => { writes += r.length; });
    mo.observe(el.shadowRoot, { subtree: true, characterData: true, childList: true });
    const slot_ = el.shadowRoot.querySelector(`slot[name="${slot}"]`);
    for (let i = 0; i < 25; i++) { slot_.dispatchEvent(new Event('slotchange')); await Promise.resolve(); }
    await wait(150);
    writes += mo.takeRecords().length; mo.disconnect();
    t.eq(writes, 0, 'an unchanged re-render rewrote text or children (what makes WebKit fire slotchange)');
    t.ok(renders <= 25, `${renders} renders for 25 slotchange events: the render must not feed back into slotchange`);
    el.render = render;
}]);
