// Opt-in helpers for the state store (js/store.js, #348), kept out of it so a page that needs neither pays for neither. Each wraps a module spec:
//
//   store.module('gallery', syncTabs(withLegacy({ defaults, persist, legacy: { scale: 'pk-gallery-scale', inspector: 'pk-gallery-inspector' } })));
//
// withLegacy(spec)   when nothing is stored yet, reads each `spec.legacy` key ({ stateKey: 'old-storage-key' }) ONCE and offers the values to the store,
//                    which validates them like stored ones (the old key is left alone until the site adopts the store). Old values are plain strings:
//                    a string default takes the text as it is, a boolean takes 1/0/true/false, everything else is parsed as JSON. Anything else is
//                    passed on as text, so the schema rejects it with the store's one warning. Today's keys: pk-site-theme, pk-gallery-scale,
//                    pk-gallery-width, pk-gallery-inspector (1/0), pk-gallery-inspector-w, pk-theme-overrides, pk-layout-builder-draft, pk-example-nav.
// syncTabs(spec)     cross-tab sync: another tab's write to the module's key arrives as a `storage` event (no polling) and is validated like any read;
//                    a key removed in another tab resets to the defaults. The listener is removed by the module's or the store's destroy().
const parse = t => { try { return JSON.parse(t); } catch { return t; } };

export const withLegacy = spec => ({
    ...spec,
    import(get) {
        const data = {};
        for (const [key, old] of Object.entries(spec.legacy ?? {})) {
            const raw = get(old), type = typeof spec.defaults?.[key];
            if (raw != null) data[key] = type === 'string' ? raw : type === 'boolean' ? (raw === '1' || raw === '0' ? raw === '1' : parse(raw)) : parse(raw);
        }
        return Object.keys(data).length ? data : undefined;
    }
});

export const syncTabs = (spec, { events = globalThis, storage } = {}) => ({
    ...spec,
    attach(load, key) {
        const on = e => e.key === key && (!storage || e.storageArea === storage) && load(e.newValue);
        events.addEventListener?.('storage', on);
        return () => events.removeEventListener?.('storage', on);
    }
});
