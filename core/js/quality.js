// Plainkit quality checks, plain JS. Two halves: collect() reads a document into plain measures, evaluate() turns measures
// into findings. evaluate() and the text scanners are pure, so Node tests them without a browser.
// Thresholds live in one object (DEFAULTS) that a caller overrides; the scorecard keeps its own copy in scoring.data.js.
// Framework-free; no imports.

export const DEFAULTS = Object.freeze({
    touchTargetPx: 44,          // interactive controls smaller than this (either side) fail on a phone
    maxNestedScrollers: 0,      // a scroll container inside another scroll container
    literalColour: /#[0-9a-fA-F]{3,8}\b|\brgba?\(/,
    interactive: 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [tabindex]:not([tabindex="-1"])',
    // Custom elements whose control lives in a shadow root, so none of the selectors above reach it: measured and named here (a pk-button's ring is drawn inside its shadow root, so they are not focus-probed).
    hosts: 'pk-button',
    maxFocusProbe: 40,
    minGapPx: 4,                // controls in a row or stack closer than this fail (the --gap-min token)
    minPaddingPx: 4,            // text closer than this to the edge of a bordered or filled box fails
    gapTolerancepx: 6,          // gaps within one stack may differ by at most this
    flush: '.cv-scroll, .cv-row, .input-group, .btn-group, .ft-list, .co, .csr-group, .tabs, .pagination, .list-group, .gal-item, .dg-body, .flyout-panel--docked, .stat-card-value-row, .workspace, .workspace-main, .ft-row, .combo-popup, .tag-input, pk-tree, pk-side-nav, pk-list-group, pk-timeline, pk-stepper, pk-field-list',
});

const cssPath = el => {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && parts.length < 4; n = n.parentElement) {
        const cls = [...n.classList].slice(0, 2).map(c => '.' + c).join('');
        parts.unshift(n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + cls);
    }
    return parts.join(' > ');
};

// Accessible name of a control, the way the checks need it: aria-label, aria-labelledby, label, alt, title, placeholder, text.
export function accessibleName(el) {
    const doc = el.ownerDocument;
    const attr = n => (el.getAttribute(n) ?? '').trim();
    if (attr('aria-label')) return attr('aria-label');
    if (el.localName === 'pk-button' && attr('label')) return attr('label'); // pk-button: the label prop wins over its text, as its inner button says
    const by = attr('aria-labelledby');
    if (by) { const t = by.split(/\s+/).map(id => doc.getElementById(id)?.textContent ?? '').join(' ').trim(); if (t) return t; }
    if (el.labels?.length) { const t = [...el.labels].map(l => l.textContent).join(' ').trim(); if (t) return t; }
    if (attr('alt')) return attr('alt');
    // The rendered label of an element (a tree row, a step) lives in its shadow tree and its name is set through ElementInternals, which a page cannot read back.
    const text = (el.textContent ?? '').trim() || (el.shadowRoot?.textContent ?? '').trim();
    if (text) return text;
    if (el.tagName === 'INPUT' && ['button', 'submit', 'reset'].includes(el.type) && el.value) return el.value;
    return attr('title') || attr('placeholder');
}

const INLINE = /^(SPAN|A|CODE|STRONG|EM|B|I|SMALL|LABEL|SUP|SUB|MARK|BR|SVG|USE|IMG|KBD|TIME|ABBR)$/;
const CONTROL = /^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/;

// Controls the phone touch-target check leaves out: a link inside running text (WCAG 2.5.8 exempts it; the size sweep applies the same rule)
// and a tab panel, which is focusable for the keyboard but is not something a finger taps.
export const touchExempt = (el, win) => el.localName === 'pk-tab-panel' || (el.tagName === 'A' && win.getComputedStyle(el).display === 'inline');

// Spacing measures: consecutive block siblings with no gap, controls sitting closer than the minimum gap, text touching the
// edge of a box that has its own border or fill, and containers whose gaps disagree. Containers marked data-flush, or matching
// cfg.flush (rows that are flush by design: code lines, tree rows, joined groups), are skipped.
export function spacingMeasures(scope, win, cfg) {
    const out = [];
    const skip = el => el.closest?.(cfg.flush) || el.closest?.('[data-flush]');
    const visible = el => { const s = win.getComputedStyle(el); if (s.position === 'absolute' || s.position === 'fixed' || s.display === 'none') return null; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? r : null; };
    for (const el of scope.querySelectorAll('*')) {
        if (/^(TR|THEAD|TBODY|TFOOT|TABLE|SELECT|SVG|PRE|HEAD|SCRIPT|STYLE|UL|OL|DL)$/.test(el.tagName) || skip(el)) continue;
        const cs = win.getComputedStyle(el);
        // Text (or an inline control) sitting hard against the edge of a box that has its own border or fill.
        const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
        // A host with a shadow tree slots its text into parts that carry their own padding (an accordion item, a code block): the host's own padding is not the edge.
        if (hasText && !el.shadowRoot && !INLINE.test(el.tagName) && !/^(TD|TH|LI|BUTTON|SUMMARY|OPTION|CODE)$/.test(el.tagName)) {
            const boxed = parseFloat(cs.borderLeftWidth) > 0 || !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor);
            const left = parseFloat(cs.paddingLeft);
            if (boxed && left < cfg.minPaddingPx) out.push({ kind: 'text-at-edge', selector: cssPath(el), value: left, min: cfg.minPaddingPx });
        }
        const kids = [...el.children].map(k => [k, visible(k)]).filter(([, r]) => r);
        if (kids.length < 2 || !/(block|flex|grid|flow-root)/.test(cs.display)) continue;
        const gaps = [];
        for (let i = 1; i < kids.length; i++) {
            const [a, ra] = kids[i - 1]; const [b, rb] = kids[i];
            const vertical = rb.top >= ra.bottom - 1; const horizontal = !vertical && rb.left >= ra.right - 1 && rb.top < ra.bottom && ra.top < rb.bottom;
            const gap = vertical ? rb.top - ra.bottom : horizontal ? rb.left - ra.right : null;
            if (gap === null) continue;
            const bothControls = CONTROL.test(a.tagName) && CONTROL.test(b.tagName);
            if (bothControls && gap < cfg.minGapPx) out.push({ kind: gap < 0.5 ? 'zero-gap' : 'tight-controls', selector: cssPath(b), value: Math.round(gap * 10) / 10, min: cfg.minGapPx });
            else if (vertical && gap < 0.5 && !INLINE.test(a.tagName) && !INLINE.test(b.tagName) && !(a.tagName === 'INPUT' || b.tagName === 'INPUT')) out.push({ kind: 'zero-gap', selector: cssPath(b), value: 0, min: cfg.minGapPx });
            if (vertical) gaps.push(gap);
        }
        if (gaps.length >= 3 && Math.max(...gaps) - Math.min(...gaps) > cfg.gapTolerancepx) out.push({ kind: 'inconsistent-gaps', selector: cssPath(el), value: Math.round((Math.max(...gaps) - Math.min(...gaps)) * 10) / 10, min: cfg.gapTolerancepx });
    }
    return out;
}

// True when an element takes up room, or is display: contents (a lightbox, a back-to-top button) and something inside it, in its light or shadow tree, does.
export function hasBox(el, win) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return true;
    return win.getComputedStyle(el).display === 'contents' && [...el.children, ...(el.shadowRoot?.children ?? [])].some(k => !/^(SCRIPT|STYLE)$/.test(k.tagName) && hasBox(k, win));
}

export function collect(root, options = {}) {
    const cfg = { ...DEFAULTS, ...options };
    const doc = root.ownerDocument ?? root;
    const win = doc.defaultView;
    const scope = root.querySelectorAll ? root : doc;
    const controls = [];
    for (const el of scope.querySelectorAll(`${cfg.interactive}, ${cfg.hosts}`)) {
        if (el.disabled || el.hidden || el.closest('[hidden]')) continue;
        // A checkbox or radio is tapped through its label, so the label is the target that counts.
        const r = (el.type === 'checkbox' || el.type === 'radio') && el.labels?.length ? el.labels[0].getBoundingClientRect() : el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        controls.push({ selector: cssPath(el), tag: el.tagName.toLowerCase(), role: el.getAttribute('role'), name: accessibleName(el), width: r.width, height: r.height, tabindex: el.hasAttribute('tabindex') ? Number(el.getAttribute('tabindex')) : null, exempt: touchExempt(el, win) });
    }
    const images = [...scope.querySelectorAll('img')].map(el => ({ selector: cssPath(el), alt: el.getAttribute('alt') }));
    const scrollers = [];
    for (const el of scope.querySelectorAll('*')) {
        const s = win.getComputedStyle(el);
        const scrolls = /(auto|scroll)/.test(s.overflowX + s.overflowY) && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
        if (!scrolls) continue;
        let depth = 0;
        for (let p = el.parentElement; p; p = p.parentElement) {
            const ps = win.getComputedStyle(p);
            if (/(auto|scroll)/.test(ps.overflowX + ps.overflowY) && p !== doc.body && p !== doc.documentElement && (p.scrollHeight > p.clientHeight + 1 || p.scrollWidth > p.clientWidth + 1)) depth++;
        }
        scrollers.push({ selector: cssPath(el), depth });
    }
    const literals = [];
    for (const el of scope.querySelectorAll('[style]')) {
        const v = el.getAttribute('style');
        if (cfg.literalColour.test(v)) literals.push({ selector: cssPath(el), value: v });
    }
    const de = doc.documentElement;
    const visibleChildren = [...(scope.children ?? [])].filter(el => !/^(SCRIPT|STYLE)$/.test(el.tagName) && hasBox(el, win)).length;
    const spacing = spacingMeasures(scope, win, cfg);
    return { controls, images, scrollers, literals, spacing, visibleChildren, overflowX: de.scrollWidth - de.clientWidth, width: win.innerWidth, nodes: scope.querySelectorAll('*').length };
}

// Findings from measures: { check, category, severity: 'error' | 'warn', selector, message }.
export function evaluate(m, options = {}) {
    const cfg = { ...DEFAULTS, ...options };
    const out = [];
    const add = (check, category, severity, selector, message) => out.push({ check, category, severity, selector, message });
    for (const c of m.controls) {
        if (!c.name) add('unnamed-input', 'accessibility', 'error', c.selector, `${c.tag} has no accessible name`);
        if (c.tabindex !== null && c.tabindex > 0) add('positive-tabindex', 'accessibility', 'warn', c.selector, 'positive tabindex overrides the natural tab order');
        if (cfg.phone && !c.exempt && (c.width < cfg.touchTargetPx - 0.5 || c.height < cfg.touchTargetPx - 0.5)) add('touch-target', 'look', 'warn', c.selector, `${Math.round(c.width)}x${Math.round(c.height)}px is under ${cfg.touchTargetPx}px on a phone`);
    }
    for (const i of m.images) if (i.alt === null) add('image-alt', 'accessibility', 'error', i.selector, 'image has no alt attribute');
    for (const s of m.scrollers) if (s.depth > cfg.maxNestedScrollers) add('nested-scroll', 'look', 'error', s.selector, `scroll container nested ${s.depth} deep inside another`);
    for (const l of m.literals) add('literal-colour', 'look', 'warn', l.selector, `inline literal colour: ${l.value}`);
    for (const s of m.spacing ?? []) add(s.kind, 'look', s.kind === 'zero-gap' ? 'error' : 'warn', s.selector, s.kind === 'text-at-edge' ? `text is ${s.value}px from the edge of its box (minimum ${s.min}px)` : s.kind === 'inconsistent-gaps' ? `gaps in this stack differ by ${s.value}px (tolerance ${s.min}px)` : `${s.kind === 'zero-gap' ? 'no gap' : s.value + 'px gap'} between adjacent siblings (minimum ${s.min}px)`);
    if (m.visibleChildren === 0) add('empty-preview', 'look', 'error', 'body', 'the preview stage has no visible content');
    if (m.overflowX > 0) add('horizontal-overflow', 'look', 'error', 'document', `page is ${m.overflowX}px wider than the ${m.width}px viewport`);
    return out;
}

// Literal colours in stylesheet text (tokens.css is where they belong, so callers skip it): [{ line, text }].
export function literalColours(cssText, literal = DEFAULTS.literalColour) {
    const clean = cssText.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
    const found = [];
    clean.split('\n').forEach((line, i) => { const m = literal.exec(line); if (m) found.push({ line: i + 1, text: line.trim() }); });
    return found;
}

// Literal lengths (px or rem/em) declared in stylesheet text that are not a token: a rough adherence measure. [{ line, text }].
export function literalSizes(cssText) {
    const clean = cssText.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
    const found = [];
    clean.split('\n').forEach((line, i) => {
        if (/^\s*--/.test(line) || /@media|@container/.test(line)) return;
        if (/(padding|margin|gap|font-size|border-radius|width|height)[a-z-]*\s*:[^;]*\b\d*\.?\d+(px|rem|em)\b/.test(line) && !/var\(--/.test(line)) found.push({ line: i + 1, text: line.trim() });
    });
    return found;
}

// Stylesheet statistics from its text: bytes, rule count, selector count, declaration count.
export function cssStats(cssText) {
    const clean = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = (clean.match(/\{/g) ?? []).length;
    const selectors = [...clean.matchAll(/([^{}]+)\{/g)].filter(m => !m[1].trim().startsWith('@')).reduce((n, m) => n + m[1].split(',').length, 0);
    return { bytes: cssText.length, rules, selectors, declarations: (clean.match(/;/g) ?? []).length };
}

// Selectors in stylesheet text that match nothing in `documents` (browser) - an estimate: pseudo-states and media are skipped.
export function unusedSelectors(cssText, documents) {
    const clean = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
    const unused = []; let total = 0;
    for (const m of clean.matchAll(/([^{}]+)\{/g)) {
        if (m[1].trim().startsWith('@')) continue;
        for (const raw of m[1].split(',')) {
            const sel = raw.trim().replace(/::?[a-z-]+(\([^)]*\))?/gi, '').trim();
            if (!sel || /^(\*|html|body|:root)/.test(sel)) continue;
            total++;
            let hit = false;
            for (const d of documents) { try { if (d.querySelector(sel)) { hit = true; break; } } catch { hit = true; } }
            if (!hit) unused.push(raw.trim());
        }
    }
    return { total, unused };
}

// Selectors of every rule in the document's stylesheets that draws a focus ring (a :focus-visible or :focus rule with an outline
// or box-shadow), with the pseudo-class removed so they can be tested with matches(). Programmatic focus() does not reliably
// trigger :focus-visible, so the rules are read instead of the computed style.
export function focusRingSelectors(doc) {
    const out = [];
    const walk = sheet => {
        let rules; try { rules = sheet.cssRules; } catch { return; }
        for (const r of rules) {
            if (r.styleSheet) walk(r.styleSheet);
            else if (r.cssRules && !r.selectorText) { for (const inner of r.cssRules) visit(inner); }
            else visit(r);
        }
    };
    const visit = r => {
        if (!r.selectorText || !/:focus/.test(r.selectorText)) return;
        const s = r.style; const ring = (s.outlineStyle && s.outlineStyle !== 'none') || (s.outline && !/none|^0/.test(s.outline)) || (s.boxShadow && s.boxShadow !== 'none');
        if (!ring) return;
        for (const sel of r.selectorText.split(',')) out.push(sel.replace(/:focus-visible|:focus-within|:focus/g, '').trim() || '*');
    };
    for (const sheet of doc.styleSheets) walk(sheet);
    return out;
}

// Controls with no rule that would draw a focus ring for them.
export function focusProblems(root, options = {}) {
    const cfg = { ...DEFAULTS, ...options };
    const doc = root.ownerDocument ?? root;
    const rings = focusRingSelectors(doc);
    const problems = [];
    const els = [...(root.querySelectorAll ?? doc.querySelectorAll).call(root, cfg.interactive)].filter(e => !e.disabled && e.getClientRects().length).slice(0, cfg.maxFocusProbe);
    for (const el of els) {
        const covered = rings.some(sel => { try { return el.matches(sel); } catch { return false; } });
        if (!covered) problems.push({ check: 'focus-visible', category: 'accessibility', severity: 'error', selector: cssPath(el), message: 'no stylesheet rule draws a focus indicator for it' });
    }
    return problems;
}
