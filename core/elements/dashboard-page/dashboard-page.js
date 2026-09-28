import { renderState } from '../../js/page-states.js';
import { loadElements } from '../../js/loader.js';

// Which element a tile's kind composes.
const TILE_TAG = { stat: 'pk-stat', chart: 'pk-chart' };

export default Base => class extends Base {
    connected() {
        if (this.$w) return;
        this.$w = true;
        loadElements(this.shadowRoot);
        this.buildLayout();
    }
    changed(name) {
        if (name !== 'config') return;
        this.buildLayout();
    }

    // Rebuilds every tile box from config.tiles/config.sections and starts each tile's own load, independently: this loop never awaits,
    // so one tile's slow or rejecting loadTile() never delays or breaks the others (the per-tile-async-boundary requirement, #436).
    buildLayout() {
        const doc = this.ownerDocument;
        const body = this.part('body');
        body.replaceChildren();
        this.$tileBoxes = {};
        this.$tokens = {};
        const tiles = this.config?.tiles ?? [];
        const byKey = Object.fromEntries(tiles.map(t => [t.key, t]));
        const sections = this.config?.sections?.length ? this.config.sections : [{ tiles: tiles.map(t => t.key) }];
        for (const section of sections) {
            const sec = doc.createElement('div');
            sec.setAttribute('part', 'section');
            if (section.heading) {
                const heading = doc.createElement('h3');
                heading.setAttribute('part', 'section-heading');
                heading.textContent = section.heading;
                sec.append(heading);
            }
            const grid = doc.createElement('div');
            grid.setAttribute('part', 'grid');
            for (const key of section.tiles ?? []) {
                const tile = byKey[key];
                if (!tile) continue;
                const box = doc.createElement('div');
                box.setAttribute('part', 'tile');
                box.dataset.key = key;
                grid.append(box);
                this.$tileBoxes[key] = box;
            }
            sec.append(grid);
            body.append(sec);
        }
        loadElements(body);
        for (const tile of tiles) this.loadTile(tile);
    }

    // One tile's own async boundary: loading, then the tile element on success, or an error state with Retry on rejection. A token guards
    // against a stale response drawing over a box that has since moved on (rebuilt config, or a newer retry of the same tile).
    async loadTile(tile) {
        const box = this.$tileBoxes?.[tile.key];
        if (!box) return;
        const token = (this.$tokens[tile.key] = {});
        renderState(box, 'loading', { label: tile.label ? `Loading ${tile.label}` : 'Loading' });
        loadElements(box);
        if (typeof this.load !== 'function') { renderState(box, 'empty', tile.empty); loadElements(box); return; }
        let result;
        try {
            result = await this.load(tile.key);
        } catch (err) {
            if (this.$tokens[tile.key] !== token) return;
            renderState(box, 'error', { description: err?.message ?? String(err), retry: () => this.loadTile(tile) });
            loadElements(box);
            return;
        }
        if (this.$tokens[tile.key] !== token) return;
        renderState(box, 'ready');
        const doc = this.ownerDocument;
        const tag = TILE_TAG[tile.kind] ?? 'pk-stat';
        const el = doc.createElement(tag);
        if (tag === 'pk-stat') el.label = tile.label ?? '';
        if (tag === 'pk-chart') el.caption = tile.label ?? '';
        Object.assign(el, result);
        box.append(el);
        loadElements(box);
    }
};
