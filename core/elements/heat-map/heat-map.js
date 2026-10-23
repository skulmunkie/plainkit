// pk-heat-map (#1721, phase 1): a flat squarified treemap. The maths is js/heat-map-layout.js (tested alone); this draws its boxes as links or buttons in a list,
// positions each one through custom properties set with the CSSOM (CSP allows that; no style attribute is ever written), keeps a visually hidden data table beside them
// as the accessible fallback, and moves between boxes with the arrow keys (one tab stop for the whole map).
import { layout, cleanItems, OTHER_ID } from '../../js/heat-map-layout.js';
import { safeHref } from '../../js/safe-url.js';

const WORD = { info: 'Info', success: 'Success', warning: 'Warning', danger: 'Danger' };
const DIRS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const FORMATS = { number: n => n.toLocaleString(), compact: n => n.toLocaleString(undefined, { notation: 'compact' }), share: (n, total) => `${Math.round((n / total) * 1000) / 10}%` };
const pct = i => `${Math.round(i * 100)}%`;
const centre = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

export default Base => class extends Base {
    connected() {
        const map = this.part('map');
        this.$ro ??= new ResizeObserver(() => this.draw());
        this.$ro.observe(map);
        if (this.$on) return;
        this.$on = true;
        map.addEventListener('keydown', e => this.key(e));
        map.addEventListener('focusin', e => this.focused(e.target.closest('.box')));
        map.addEventListener('click', e => this.pick(e));
    }
    disconnected() { this.$ro?.disconnect(); }
    updated() {
        this.aria({ role: 'group', ariaLabel: this.label });
        this.$items = cleanItems(this.items, m => this.warnOnce(`items:${m}`, m));
        this.$total = this.$items.reduce((a, it) => a + it.value, 0);
        this.part('empty').hidden = this.$items.length > 0;
        this.table();
        this.draw();
    }

    // The data table: one row per item, largest first, with its share of the total.
    table() {
        const doc = this.ownerDocument, total = this.$total, heat = this.scale === 'intensity';
        const row = it => {
            const tr = doc.createElement('tr'), th = doc.createElement('th');
            th.scope = 'row'; th.textContent = it.label; tr.append(th);
            for (const text of [this.fmt(it.value), `${Math.round((it.value / total) * 1000) / 10}%`, heat ? pct(it.intensity ?? 0) : WORD[it.severity] ?? 'Neutral']) { const td = doc.createElement('td'); td.textContent = text; tr.append(td); }
            return tr;
        };
        this.part('rows').replaceChildren(...[...this.$items].sort((a, b) => b.value - a.value).map(row));
    }

    draw() {
        const map = this.part('map'), w = map.clientWidth, h = map.clientHeight;
        const boxes = w > 0 && h > 0 ? layout(this.$items ?? [], w, h, { minBox: this.minBox, layout: this.layout, maxItems: this.maxItems }) : [];
        const sig = boxes.map(b => JSON.stringify([b.id, b.item?.label, b.value, b.item?.severity ?? b.severity, b.item?.intensity, b.item?.href, b.members?.length, this.scale, this.valueFormat]));
        if (!this.$sig || sig.length !== this.$sig.length || sig.some((s, i) => s !== this.$sig[i])) {
            const had = this.shadowRoot.activeElement?.dataset.id;
            this.$sig = sig;
            this.$nodes = boxes.map(b => this.build(b));
            map.replaceChildren(...this.$nodes);
            const keep = this.$nodes.find(li => li.firstChild.dataset.id === (had ?? this.$active)) ?? this.$nodes[0];
            this.rove(keep?.firstChild);
            if (had) keep?.firstChild.focus();
        }
        this.$boxes = boxes;
        boxes.forEach((b, i) => { const s = this.$nodes[i].style; s.setProperty('--_x', b.x); s.setProperty('--_y', b.y); s.setProperty('--_w', b.w); s.setProperty('--_h', b.h); });
    }

    fmt(n) { return FORMATS[this.valueFormat](n, this.$total); }

    // The shown form of a box: Other takes the most serious severity of its members and their value-weighted intensity.
    shown(b) {
        if (b.item) return b.item;
        const m = b.members, w = m.reduce((a, x) => a + x.value, 0);
        return { label: `Other (${m.length})`, severity: b.severity, intensity: m.reduce((a, x) => a + (x.intensity ?? 0) * x.value, 0) / w };
    }

    build(b) {
        const doc = this.ownerDocument, it = this.shown(b), heat = this.scale === 'intensity', tone = heat ? pct(it.intensity ?? 0) : WORD[it.severity];
        const href = b.item && it.href ? safeHref(String(it.href)) : null;
        const li = doc.createElement('li'), box = doc.createElement(href ? 'a' : 'button');
        li.className = 'item';
        box.className = b.item ? 'box' : 'box other';
        box.dataset.id = b.id; box.tabIndex = -1;
        if (heat) { box.classList.add('heat'); box.style.setProperty('--_i', it.intensity ?? 0); } else box.dataset.severity = it.severity;
        if (href) box.setAttribute('href', href); else box.type = 'button';
        const name = [it.label, this.fmt(b.value), heat ? `intensity ${tone}` : tone].filter(Boolean).join(', ');
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
        const b = box && this.$boxes.find(x => x.id === box.dataset.id);
        this.rove(box);
        if (b) this.emit('pk-heat-focus-item', { id: b.id, item: b.item ?? { id: OTHER_ID, value: b.value, members: b.members } }, { cancelable: false });
    }

    key(e) {
        const boxes = [...this.shadowRoot.querySelectorAll('.box')], from = e.target.closest('.box');
        let next = null;
        if (e.key === 'Home') next = boxes[0];
        else if (e.key === 'End') next = boxes.at(-1);
        else if (DIRS[e.key] && from) {
            const [dx, dy] = DIRS[e.key], c = centre(from);
            let best = Infinity;
            for (const b of boxes) {
                if (b === from) continue;
                const p = centre(b), along = (p.x - c.x) * dx + (p.y - c.y) * dy, across = Math.abs((p.x - c.x) * dy - (p.y - c.y) * dx);
                if (along > 0 && along + across * 2 < best) { best = along + across * 2; next = b; }
            }
        }
        if (!next) return;
        e.preventDefault();
        next.focus();
    }

    pick(e) {
        const box = e.target.closest('.box'), b = box && this.$boxes.find(x => x.id === box.dataset.id);
        if (!b) return;
        const item = b.item ?? { id: OTHER_ID, label: box.firstChild.textContent, value: b.value, members: b.members };
        if (!this.emit('pk-heat-select', { id: b.id, item })) e.preventDefault();
    }
};
