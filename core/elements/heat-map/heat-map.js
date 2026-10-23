// pk-heat-map (#1721): a squarified (or rows) treemap. The maths is js/heat-map-layout.js (tested alone); this draws its boxes as links or buttons in a list,
// positions each one through custom properties set with the CSSOM (CSP allows that; no style attribute is ever written), keeps a visually hidden data table beside them
// as the accessible fallback, and moves between boxes with the arrow keys (one tab stop for the whole map). With group-by, items that have children are drawn as framed areas
// (one level); activating the merged Other box opens its members as a table over the map.
import { readTable, layout, layoutGrouped, cleanItems, shownBox, neighbour, WORD, FORMATS, pct, OTHER_ID } from '../../js/heat-map-layout.js';
import { safeHref } from '../../js/safe-url.js';

const keyOf = b => (b.parent ? `${b.parent}/${b.id}` : b.id);

export default Base => class extends Base {
    connected() {
        const map = this.part('map');
        this.$ro ??= new ResizeObserver(() => this.draw());
        this.$ro.observe(map);
        this.$mo ??= new MutationObserver(() => this.requestUpdate());
        this.$mo.observe(this, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-value', 'data-id', 'href'] });
        if (this.$on) return;
        this.$on = true;
        map.addEventListener('keydown', e => this.key(e));
        map.addEventListener('focusin', e => this.focused(e.target.closest('.box')));
        map.addEventListener('click', e => this.pick(e));
        this.part('more-close').addEventListener('click', () => this.closeMore());
        this.part('more').addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); this.closeMore(); } });
    }
    disconnected() { this.$ro?.disconnect(); this.$mo?.disconnect(); }
    updated() {
        this.aria({ role: 'group', ariaLabel: this.label });
        this.$items = cleanItems(this.items?.length ? this.items : this.querySelector(':scope > table') ? readTable(this.querySelector(':scope > table')) : this.items, m => this.warnOnce(`items:${m}`, m));
        this.$total = this.$items.reduce((a, it) => a + it.value, 0);
        this.part('empty').hidden = this.$items.length > 0;
        this.table();
        this.draw();
    }

    // One table row: name, value, share of the total, and the status (or the intensity).
    row(it, label = it.label) {
        const doc = this.ownerDocument, tr = doc.createElement('tr'), th = doc.createElement('th');
        th.scope = 'row'; th.textContent = label; tr.append(th);
        for (const text of [this.fmt(it.value), `${Math.round((it.value / this.$total) * 1000) / 10}%`, this.scale === 'intensity' ? pct(it.intensity ?? 0) : WORD[it.severity] ?? 'Neutral']) { const td = doc.createElement('td'); td.textContent = text; tr.append(td); }
        return tr;
    }

    // The data table: one row per item, largest first; with group-by a child reads "Group / child".
    table() {
        const rows = this.$items.flatMap(it => (this.groupBy && it.children ? it.children.map(c => ({ ...c, name: `${it.label} / ${c.label}` })) : [{ ...it, name: it.label }]));
        this.part('rows').replaceChildren(...rows.sort((a, b) => b.value - a.value).map(it => this.row(it, it.name)));
    }

    draw() {
        const map = this.part('map'), w = map.clientWidth, h = map.clientHeight, em = parseFloat(getComputedStyle(this).fontSize) || 14;
        const opts = { minBox: this.minBox, layout: this.layout, maxItems: this.maxItems }, ok = w > 0 && h > 0;
        const grouped = ok && this.groupBy ? layoutGrouped(this.$items ?? [], w, h, opts, { header: 2 * em, pad: em / 4 }) : { groups: [], boxes: ok ? layout(this.$items ?? [], w, h, opts) : [] };
        const { groups, boxes } = grouped, rects = [...groups, ...boxes];
        const sig = rects.map(b => JSON.stringify([b.id, b.parent, b.item?.label, b.value, b.item?.severity ?? b.severity, b.item?.intensity, b.item?.href, b.members?.length, this.scale, this.valueFormat]));
        if (!this.$sig || sig.length !== this.$sig.length || sig.some((s, i) => s !== this.$sig[i])) {
            const had = this.shadowRoot.activeElement?.dataset.id;
            this.$sig = sig;
            this.$groupLabels = new Map(groups.map(g => [g.id, g.item.label]));
            this.$boxNodes = boxes.map(b => this.build(b));
            this.$nodes = [...groups.map(g => this.frame(g)), ...this.$boxNodes];
            map.replaceChildren(...this.$nodes);
            this.closeMore(false);
            const keep = this.$boxNodes.find(li => li.firstChild.dataset.id === (had ?? this.$active)) ?? this.$boxNodes[0];
            this.rove(keep?.firstChild);
            if (had) keep?.firstChild.focus();
        }
        this.$boxes = boxes;
        rects.forEach((b, i) => { const s = this.$nodes[i].style; s.setProperty('--_x', b.x); s.setProperty('--_y', b.y); s.setProperty('--_w', b.w); s.setProperty('--_h', b.h); });
    }

    fmt(n) { return FORMATS[this.valueFormat](n, this.$total); }

    // The frame of a group: a border with the group's name and total over the area its children fill. It is decoration (the children carry the group name).
    frame(g) {
        const doc = this.ownerDocument, li = doc.createElement('li'), box = doc.createElement('div');
        li.className = 'item frame'; li.setAttribute('aria-hidden', 'true'); box.className = 'fbox';
        for (const [cls, text] of [['glabel', g.item.label], ['gvalue', this.fmt(g.value)]]) { const s = doc.createElement('span'); s.className = cls; s.textContent = text; box.append(s); }
        li.append(box);
        return li;
    }

    build(b) {
        const doc = this.ownerDocument, it = shownBox(b), heat = this.scale === 'intensity', tone = heat ? pct(it.intensity ?? 0) : WORD[it.severity];
        const href = b.item && it.href ? safeHref(String(it.href)) : null;
        const li = doc.createElement('li'), box = doc.createElement(href ? 'a' : 'button');
        li.className = 'item';
        box.className = b.item ? 'box' : 'box other';
        box.dataset.id = keyOf(b); box.tabIndex = -1;
        if (heat) { box.classList.add('heat'); box.style.setProperty('--_i', it.intensity ?? 0); } else box.dataset.severity = it.severity;
        if (href) box.setAttribute('href', href); else box.type = 'button';
        const name = [b.parent ? `${this.$groupLabels.get(b.parent)}: ${it.label}` : it.label, this.fmt(b.value), heat ? `intensity ${tone}` : tone].filter(Boolean).join(', ');
        box.setAttribute('aria-label', name); box.title = name;
        for (const [part, text] of [['label', it.label], ['value', this.fmt(b.value)], ['status', tone]]) {
            if (!text) continue;
            const s = doc.createElement('span'); s.className = part; s.textContent = text; box.append(s);
        }
        li.append(box);
        return li;
    }

    // One tab stop: only the active box is in the tab order.
    rove(box) {
        if (!box) return;
        this.$active = box.dataset.id;
        const all = this.shadowRoot.querySelectorAll('.box');
        for (let i = 0; i < all.length; i++) all[i].tabIndex = all[i] === box ? 0 : -1;
    }

    // Focus moved to a box: it becomes the tab stop, and pk-heat-focus-item says which item it is.
    focused(box) {
        const b = box && this.$boxes.find(x => keyOf(x) === box.dataset.id);
        this.rove(box);
        if (b) this.emit('pk-heat-focus-item', { id: b.id, item: b.item ?? { id: OTHER_ID, value: b.value, members: b.members } }, { cancelable: false });
    }

    key(e) {
        const boxes = [...this.shadowRoot.querySelectorAll('.box')], next = boxes[neighbour(boxes.map(b => b.getBoundingClientRect()), boxes.indexOf(e.target.closest('.box')), e.key)];
        if (!next) return;
        e.preventDefault();
        next.focus();
    }

    pick(e) {
        const box = e.target.closest('.box'), b = box && this.$boxes.find(x => keyOf(x) === box.dataset.id);
        if (!b) return;
        const item = b.item ?? { id: OTHER_ID, label: box.firstChild.textContent, value: b.value, members: b.members };
        if (!this.emit('pk-heat-select', { id: b.id, item })) e.preventDefault();
        else if (!b.item) this.openMore(b, box);
    }

    // Other opens its members as a table over the map (inside the element, so the height never changes); Escape or Close puts focus back on the Other box.
    openMore(b, opener) {
        const more = this.part('more'), title = `Other (${b.members.length})`;
        this.part('more-title').textContent = title;
        more.setAttribute('aria-label', title);
        this.part('more-rows').replaceChildren(...[...b.members].sort((a, c) => c.value - a.value).map(it => this.row(it)));
        more.hidden = false;
        this.$opener = opener;
        this.part('more-close').focus();
    }

    closeMore(restore = true) {
        const more = this.part('more');
        if (more.hidden) return;
        more.hidden = true;
        if (restore) this.$opener?.focus();
    }
};
