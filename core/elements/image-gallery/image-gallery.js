// pk-image-gallery: a grid of thumbnails, one of which can be the primary image, with add and remove hooks. The images are a property
// ({ src, alt, primary, status }[]); a click opens the pk-lightbox, and pk-media, pk-badge and pk-button draw the tiles. The pure parts
// (cleaning the list, which one is primary, what a removal does to it) are exported so node can test them.
import { loadElements } from '../../js/loader.js';

export const DEFAULT_MIN = '6.25rem';

// Only same-site paths, http(s) and raster data are ever given to an <img>; the lightbox holds the same line.
export function safeSrc(src) {
    if (typeof src !== 'string' || !src.trim()) return null;
    const s = src.trim();
    if (/^data:image\/(png|jpe?g|gif|webp|avif);/i.test(s)) return s;
    if (/^[\w+.-]+:/.test(s) && !/^https?:/i.test(s)) return null;
    return s;
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
        const grid = this.part('grid');
        grid.addEventListener('click', e => {
            const b = e.target.closest?.('[data-action]'); const li = b?.closest('[data-index]');
            if (!li) return;
            const i = Number(li.getAttribute('data-index'));
            if (b.getAttribute('data-action') === 'primary') this.makePrimary(i); else if (b.getAttribute('data-action') === 'remove') this.removeImage(i);
        });
        grid.addEventListener('pk-open', e => { const li = e.target.closest?.('[data-index]'); if (li) this.view(Number(li.getAttribute('data-index'))); });
        this.part('file').addEventListener('change', e => {
            const files = [...(e.target.files ?? [])]; e.target.value = '';
            if (files.length) this.emit('pk-add', { files, names: files.map(f => f.name) });
        });
    }
    get list() { return this.$list ?? []; }
    makePrimary(index) {
        const list = normalize(this.images); const previous = primaryIndex(list, this.primary);
        if (index < 0 || index >= list.length || index === previous) return;
        if (!this.emit('pk-primary-change', { index, src: list[index].src, previous })) return;
        this.$focus = index; this.images = applyPrimary(list, index); this.primary = index;
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
        const grid = this.part('grid'); const add = this.part('add-tile'); const tpl = this.shadowRoot.querySelector('template[data-tile]');
        const rule = gridRule(this.columns, this.min);
        this.style.setProperty('--_cols', rule.cols); this.style.setProperty('--_min', rule.min);
        const list = this.$list = normalize(this.images); const p = primaryIndex(list, this.primary);
        for (const li of grid.querySelectorAll('[data-index]')) li.remove();
        list.forEach((img, i) => {
            const li = tpl.content.firstElementChild.cloneNode(true);
            li.setAttribute('data-index', String(i)); li.toggleAttribute('data-primary', i === p);
            const el = li.querySelector('img'); const src = safeSrc(img.src);
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
        loadElements(this.shadowRoot).catch(() => {});
        if (this.$focus !== undefined) {
            const n = this.$focus; this.$focus = undefined;
            const target = grid.querySelector(`[data-index="${n}"] pk-media`)?.part?.('box') ?? this.part('file');
            target?.focus?.();
        }
    }
};
