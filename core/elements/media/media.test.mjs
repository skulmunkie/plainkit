// Unit tests for pk-media: the lightbox request, its button semantics and the ratio variable. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './media.js';

const make = (props = {}, slotted = [], captionSlot = []) => {
    const emitted = []; const listeners = {}; const boxAttrs = {};
    const box = { tabIndex: -1, addEventListener(t, fn) { listeners[t] = fn; }, setAttribute: (n, v) => { boxAttrs[n] = v; }, removeAttribute: n => { delete boxAttrs[n]; } };
    const caption = { hidden: null }; const vars = {};
    const el = new (behaviour(class {
        slotted(name) { return name === 'caption' ? captionSlot : slotted; }
        part(n) { return n === 'box' ? box : caption; }
        emit(n, d) { emitted.push([n, d]); return true; }
        watchSlot() {}
        get style() { return { setProperty: (k, v) => { vars[k] = v; } }; }
    }))();
    Object.assign(el, { lightbox: false, caption: '', ratio: '16/9' }, props);
    return { el, emitted, listeners, box, boxAttrs, caption, vars };
};
const img = (src, alt) => ({ localName: 'img', src, currentSrc: src, alt });

test('with lightbox, a click asks to enlarge with the image source, alt and caption', () => {
    const { el, emitted, listeners } = make({ lightbox: true, caption: 'Harbour' }, [img('/a.jpg', 'A harbour')]);
    el.connected();
    listeners.click();
    assert.deepEqual(emitted, [['pk-open', { src: '/a.jpg', alt: 'A harbour', caption: 'Harbour' }]]);
});

test('without lightbox a click does nothing', () => {
    const { el, emitted, listeners } = make({}, [img('/a.jpg', '')]);
    el.connected(); listeners.click();
    assert.deepEqual(emitted, []);
});

test('a picture gives its inner img, a video has no alt, empty media gives empty strings', () => {
    const inner = img('/p.webp', 'P');
    const pic = make({ lightbox: true }, [{ localName: 'picture', querySelector: () => inner }]); pic.el.connected(); pic.listeners.click();
    assert.equal(pic.emitted[0][1].src, '/p.webp');
    const vid = make({ lightbox: true }, [{ localName: 'video', src: '/v.mp4' }]); vid.el.connected(); vid.listeners.click();
    assert.deepEqual(vid.emitted[0][1], { src: '/v.mp4', alt: '', caption: '' });
    const none = make({ lightbox: true }, []); none.el.connected(); none.listeners.click();
    assert.deepEqual(none.emitted[0][1], { src: '', alt: '', caption: '' });
});

test('Enter and Space enlarge and are consumed; other keys are not', () => {
    const { el, emitted, listeners } = make({ lightbox: true }, [img('/a.jpg', 'x')]);
    el.connected();
    let prevented = 0;
    for (const key of ['Enter', ' ', 'a']) listeners.keydown({ key, preventDefault() { prevented++; } });
    assert.equal(emitted.length, 2); assert.equal(prevented, 2);
});

test('lightbox makes the box a labelled button in the tab order; turning it off removes that', () => {
    const on = make({ lightbox: true, caption: 'Harbour' }); on.el.updated();
    assert.equal(on.boxAttrs.role, 'button'); assert.equal(on.box.tabIndex, 0); assert.equal(on.boxAttrs['aria-label'], 'Enlarge: Harbour');
    const plain = make({ lightbox: true }); plain.el.updated();
    assert.equal(plain.boxAttrs['aria-label'], 'Enlarge image');
    on.el.lightbox = false; on.el.updated();
    assert.deepEqual(on.boxAttrs, {});
});

test('the ratio becomes a CSS aspect-ratio value and the caption hides when empty', () => {
    const a = make({ ratio: '4/3' }); a.el.updated();
    assert.equal(a.vars['--_r'], '4 / 3'); assert.equal(a.caption.hidden, true);
    const b = make({ caption: 'x' }); b.el.updated(); assert.equal(b.caption.hidden, false);
    const c = make({}, [], [{}]); c.el.updated(); assert.equal(c.caption.hidden, false);
});
