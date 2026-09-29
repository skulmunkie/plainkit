// Dynamic values go through the CSSOM, never a style attribute: applyDynamic
// applies data-dyn="prop:value; --token:value" (never used in copy-paste snippets). An entry with no value after
// the colon (`prop:`) removes that property instead of setting it - the one way a caller clears a previously-set
// dynamic property (e.g. a stale override no longer in effect) without touching `.style` itself (theme-editor.js).
// `root` itself is applied too when it carries data-dyn (querySelectorAll only ever finds descendants), so a
// caller can set the attribute on an element it just created and call applyDynamic(el) on that element alone,
// without needing it to already be attached under a container that gets its own applyDynamic pass.

function applyOne(el) {
    for (const d of el.dataset.dyn.split(';')) {
        const i = d.indexOf(':');
        if (i <= 0) continue;
        const prop = d.slice(0, i).trim(), value = d.slice(i + 1).trim();
        if (value) el.style.setProperty(prop, value); else el.style.removeProperty(prop);
    }
}

export function applyDynamic(root = document) {
    if (root.dataset?.dyn) applyOne(root);
    for (const el of root.querySelectorAll('[data-dyn]')) applyOne(el);
}
