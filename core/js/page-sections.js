// The header-tabs to pk-detail-layout sync every page that docks its section tabs in the page header needs (#2010). The layout runs with hide-tabs (the strip is
// the page's) and tabs-from="always"; `strip` is the page's pk-tabs, `layout` its pk-detail-layout. Returns the function that unbinds both listeners.
//   const off = bindSections(this.part('tabs'), this.part('layout'));
// A tab the reader chooses picks that section; after any section change (the tab, Next, a hidden invalid control revealed by a submit, or a change the host cancelled) the strip is set
// to the layout's own section in a microtask, once the layout has settled, so the two never disagree.
export function bindSections(strip, layout) {
    const pick = e => layout.pick(e.detail.value);
    const follow = () => queueMicrotask(() => { if (layout.section && strip.value !== layout.section) strip.value = layout.section; });
    strip.addEventListener('pk-tab-change', pick);
    layout.addEventListener('pk-section-change', follow);
    return () => { strip.removeEventListener('pk-tab-change', pick); layout.removeEventListener('pk-section-change', follow); };
}
