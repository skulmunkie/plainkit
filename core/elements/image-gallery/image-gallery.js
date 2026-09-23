// pk-image-gallery: a grid of thumbnails, one of which can be the primary image, with add and remove hooks. The images are a property
// ({ src, alt, primary, status }[]); a click opens the pk-lightbox, and pk-media, pk-badge and pk-button draw the tiles. The pure parts
// (cleaning the list, which one is primary, what a removal does to it) are exported so node can test them.
import { loadElements } from '../../js/loader.js';
import { safeLink } from '../../js/safe-url.js';

// The new order when the item at `from` moves to `to`; the same rule as pk-sortable's own moveOrder (core/elements/sortable/sortable.js) so
// the two elements never disagree on what a reorder means. Kept local rather than imported: an element only ever imports shared js/ modules
// (core/tests/elements.test.mjs), never another element.
function moveOrder(order, from, to) {
    if (from < 0 || from >= order.length || to < 0 || to >= order.length || from === to) return order.slice();
    const next = order.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
}

export const DEFAULT_MIN = '6.25rem';

// Only same-site paths, http(s) and raster data are ever given to an <img>; the lightbox holds the same line.
export function safeSrc(src) {
    if (typeof src !== 'string' || !src.trim()) return null;
    const s = src.trim();
    if (/^data:image\/(png|jpe?g|gif|webp|avif);/i.test(s)) return s;
    return safeLink(s) ? s : null;
}

// Pure: the list as the gallery uses it: objects with a string src, each with alt, status and a boolean primary.
export const normalize = images => (Array.isArray(images) ? images : []).filter(i => i && typeof i === 'object' && typeof i.src === 'string')
    .map(i => ({ src: i.src, alt: typeof i.alt === 'string' ? i.alt : '', status: typeof i.status === 'string' ? i.status : '', primary: i.primary === true }));

// Pure: the index of the primary image. A valid `primary` index wins; otherwise the first image flagged primary; otherwise -1.
export const primaryIndex = (images, primary = -1) => (Number.isInteger(primary) && primary >= 0 && primary < images.length ? primary : images.findIndex(i => i.primary));

// Pure: the list with exactly one image flagged primary (or none for -1).
export const applyPrimary = (images, index) => images.map((i, n) => ({ ...i, primary: n === index }));

// Pure: what removing an image leaves: the new list and the primary index. Removing the primary makes the first image the primary.
export function removeAt(images, index, primary) {
    if (index < 0 || index >= images.length) return { images, primary };
    const rest = images.filter((_, n) => n !== index);
    const next = primary < 0 ? -1 : primary === index ? (rest.length ? 0 : -1) : index < primary ? primary - 1 : primary;
    return { images: applyPrimary(rest, next), primary: next };
}

// Pure: what moving an image from `from` to `to` leaves: the new list (built with pk-sortable's own moveOrder, so the two elements
// never disagree on what a reorder means) and the primary index, tracking the same picture wherever it lands.
export function reorderAt(images, from, to, primary) {
    if (from < 0 || from >= images.length || to < 0 || to >= images.length || from === to) return { images, primary };
    const next = moveOrder(images, from, to);
    return { images: next, primary: primary < 0 ? -1 : next.indexOf(images[primary]) };
}

// Pure: the grid's column rule. With `columns` there are that many equal columns; otherwise as many as fit `min` (a plain css length).
export function gridRule(columns, min) {
    const n = Number.isInteger(columns) && columns > 0 ? Math.min(columns, 12) : 0;
    const length = typeof min === 'string' && /^\d*\.?\d+(px|rem|em)$/.test(min.trim()) ? min.trim() : DEFAULT_MIN;
    return n ? { cols: String(n), min: '0px' } : { cols: 'auto-fill', min: length };
}

export default Base => class extends Base {
    connected() {
        if (this.$w) return;
        this.$w = true;
        this.watchSlot('input', () => this.requestUpdate());
        const grid = this.part('grid');
        grid.addEventListener('click', e => {
            const b = e.target.closest?.('[data-action]'); const li = b?.closest('[data-index]');
            if (!li) return;
            const i = Number(li.getAttribute('data-index'));
            if (b.getAttribute('data-action') === 'primary') this.makePrimary(i); else if (b.getAttribute('data-action') === 'remove') this.removeImage(i);
        });
        grid.addEventListener('pk-open', e => { const li = e.target.closest?.('[data-index]'); if (li) this.view(Number(li.getAttribute('data-index'))); });
        // The grid is a pk-sortable of pk-sortable-item tiles (core/elements/sortable/): it never reorders them itself, it only reports the
        // gesture (drag through the handle, or Alt+Up/Alt+Down) as its own pk-reorder. That event is internal wiring, not the gallery's public
        // contract, so it is stopped here and turned into the gallery's own pk-reorder, which carries image src order like pk-remove and
        // pk-primary-change carry src, and which the gallery (not pk-sortable) applies to images.
        grid.addEventListener('pk-reorder', e => {
            e.stopPropagation();
            if (e.detail.external || !Number.isInteger(e.detail.from) || !Number.isInteger(e.detail.to)) return;
            this.reorder(e.detail.from, e.detail.to);
        });
        this.part('file').addEventListener('change', e => {
            const files = [...(e.target.files ?? [])]; e.target.value = '';
            if (files.length) this.emit('pk-add', { files, names: files.map(f => f.name) });
        });
        // With an input slotted (a Blazor InputFile, wrapped in a display:contents span by the generated component, so it never covers the
        // tile itself for a native label click to hit), the label's click opens that input's own picker instead of the internal one.
        this.part('add').addEventListener('click', e => {
            const ext = this.external();
            if (!ext) return;
            e.preventDefault();
            ext.click();
        });
    }
    get list() { return this.$list ?? []; }
    // The input slot's own file input (a Blazor InputFile), if there is one: with one slotted, it (not the internal input) is the add
    // tile's default label-associated control, so a click opens its own file picker and its own change (Blazor's OnChange) carries the
    // real files directly -- pk-image-gallery relays nothing and pk-add does not fire for that pick, the same contract pk-dropzone uses.
    external() { const slot = this.slotted('input')[0]; return slot?.localName === 'input' ? slot : slot?.querySelector('input') ?? null; }
    makePrimary(index) {
        const list = normalize(this.images); const previous = primaryIndex(list, this.primary);
        if (index < 0 || index >= list.length || index === previous) return;
        if (!this.emit('pk-primary-change', { index, src: list[index].src, previous })) return;
        this.$focus = index; this.images = applyPrimary(list, index); this.primary = index;
    }
    reorder(from, to) {
        const list = normalize(this.images); const p = primaryIndex(list, this.primary);
        if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return;
        const next = reorderAt(list, from, to, p);
        if (!this.emit('pk-reorder', { order: next.images.map(i => i.src), from, to, item: list[from].src })) return;
        this.$focus = to; this.images = next.images; this.primary = next.primary;
    }
    removeImage(index) {
        const list = normalize(this.images);
        if (index < 0 || index >= list.length) return;
        if (!this.emit('pk-remove', { index, src: list[index].src })) return;
        const next = removeAt(list, index, primaryIndex(list, this.primary));
        this.$focus = Math.min(index, next.images.length - 1);
        this.images = next.images; this.primary = next.primary;
    }
    async view(index = 0) {
        await customElements.whenDefined('pk-lightbox');
        const viewer = this.part('viewer');
        viewer.items = this.list.map(i => ({ src: i.src, alt: i.alt, caption: i.alt }));
        viewer.show(index);
    }
    updated() {
        this.toggleAttribute('has-input', this.slotted('input').length > 0);
        const grid = this.part('grid'); const add = this.part('add-tile'); const tpl = this.shadowRoot.querySelector('template[data-tile]');
        const rule = gridRule(this.columns, this.min);
        this.style.setProperty('--_cols', rule.cols); this.style.setProperty('--_min', rule.min);
        const list = this.$list = normalize(this.images); const p = primaryIndex(list, this.primary);
        grid.toggleAttribute('disabled', !this.editable);
        for (const li of grid.querySelectorAll('[data-index]')) li.remove();
        list.forEach((img, i) => {
            const li = tpl.content.firstElementChild.cloneNode(true);
            li.setAttribute('data-index', String(i)); li.toggleAttribute('data-primary', i === p);
            // The tile's own reorder identity for this render; pk-sortable reports it back in pk-reorder's order/item. Rebuilt every render,
            // since the list itself is the source of truth (STANDARDS.md, "Ownership and reactivity": the host, here the gallery's own state,
            // owns this data, pk-sortable only reports the gesture).
            li.setAttribute('value', String(i)); li.toggleAttribute('disabled', !this.editable);
            const el = li.querySelector('img'); const src = safeSrc(img.src);
            if (!src && typeof img.src === 'string' && img.src.trim()) this.warnOnce(`src:${i}`, `image ${i + 1} has a source that is not allowed (only same-site paths, http(s) and png/jpeg/gif/webp/avif data URLs are shown): it is left blank`, { src: img.src.slice(0, 80) });
            if (src) el.setAttribute('src', src); el.setAttribute('alt', img.alt);
            const status = li.querySelector('[part="status"]');
            if (img.status) status.textContent = img.status; else status.remove();
            if (i !== p) li.querySelector('[part="badge"]').remove();
            const actions = li.querySelector('[part="actions"]'); const name = img.alt || `image ${i + 1}`;
            if (!this.editable) actions.remove();
            else {
                const [make, remove] = actions.children;
                if (i === p) make.remove(); else make.setAttribute('label', `Make primary: ${name}`);
                remove.setAttribute('label', `Remove: ${name}`);
            }
            grid.insertBefore(li, add);
        });
        loadElements(this.shadowRoot);
        if (this.$focus !== undefined) {
            const n = this.$focus; this.$focus = undefined;
            const target = grid.querySelector(`[data-index="${n}"] pk-media`)?.part?.('box') ?? this.part('file');
            target?.focus?.();
        }
    }
};
