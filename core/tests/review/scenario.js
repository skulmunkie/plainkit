// The pure parts of the UI review's scenarios (docs: CONTRIBUTING.md "Reviewing what it looks like"): what a scenario file may contain, which
// shots it makes, which steps run in which viewport, and the expectation helpers (`t`) a scenario's expect(t) is given. No DOM here: the helpers
// read the page through an `env` object, so scripts/tests/ui-review-scenarios.test.mjs runs them in Node with a fake one.
//
// A scenario is a plain ES module in core/tests/review/scenarios/ whose default export is
//   { name, elements: ['side-nav'], html: '<pk-...>', viewports?: ['desktop'|'phone'], themes?: ['light'|'dark'], issue?, steps: [...], expect(t) }
// Steps are objects with one action key (and optional `on: ['phone']` to run only in some viewports):
//   { click: sel } { hover: sel } { focus: sel } { key: 'Tab', times?: 2 } { type: 'text' } { scroll: sel, to: 800 } { set: sel, attr|prop: name, value }
//   { resize: 400 } { wait: 'settle' | ms } { shot: 'name' }
// A selector is a CSS selector; `a >>> b` looks for b inside the shadow tree of the first a (any depth of >>>).
// expect(t) runs after every `shot` step, with t.shot = the shot's name, t.viewport = { name, width, height } and t.theme.

export const VIEWPORT_NAMES = ['desktop', 'phone'];
export const THEME_NAMES = ['light', 'dark'];
export const STEP_KEYS = ['click', 'hover', 'focus', 'key', 'type', 'scroll', 'set', 'resize', 'wait', 'shot'];
const SLUG = /^[a-z][a-z0-9-]*$/;

/** Problems with a scenario module's export, as a list of messages (empty = valid). `known` = element names, when given elements must be among them. */
export function validateScenario(s, known = null) {
    const bad = [];
    if (!s || typeof s !== 'object') return ['the default export is not an object'];
    if (typeof s.name !== 'string' || !SLUG.test(s.name)) bad.push('name must be a lowercase slug (letters, digits, dashes)');
    if (!Array.isArray(s.elements) || !s.elements.length) bad.push('elements must list the elements the scenario is about (they decide when it runs)');
    else for (const e of s.elements) if (typeof e !== 'string' || e.startsWith('pk-') || (known && !known.has(e))) bad.push(`elements: "${e}" is not an element name (use the name without pk-)`);
    if (typeof s.html !== 'string' || !s.html.trim()) bad.push('html must be the markup of the page or element under review');
    if (/\sstyle\s*=|<style[\s>]/i.test(s.html ?? '')) bad.push('html must not use style attributes or style elements (CSP)');
    if (s.viewports !== undefined && (!Array.isArray(s.viewports) || !s.viewports.length || s.viewports.some(v => !VIEWPORT_NAMES.includes(v)))) bad.push(`viewports must be a non-empty subset of ${VIEWPORT_NAMES.join(', ')}`);
    if (s.themes !== undefined && (!Array.isArray(s.themes) || !s.themes.length || s.themes.some(v => !THEME_NAMES.includes(v)))) bad.push(`themes must be a non-empty subset of ${THEME_NAMES.join(', ')}`);
    if (typeof s.expect !== 'function') bad.push('expect(t) must be a function (a scenario states what it measures)');
    if (!Array.isArray(s.steps) || !s.steps.length) { bad.push('steps must be a non-empty array'); return bad; }
    const shots = new Set();
    s.steps.forEach((st, i) => {
        const at = `steps[${i}]`;
        const keys = st && typeof st === 'object' ? STEP_KEYS.filter(k => k in st) : [];
        if (keys.length !== 1) return bad.push(`${at} needs exactly one of ${STEP_KEYS.join(', ')}`);
        const k = keys[0];
        if (st.on !== undefined && (!Array.isArray(st.on) || st.on.some(v => !VIEWPORT_NAMES.includes(v)))) bad.push(`${at}.on must be a list of viewport names`);
        if (['click', 'hover', 'focus', 'scroll', 'set'].includes(k) && (typeof st[k] !== 'string' || !st[k].trim())) bad.push(`${at}.${k} must be a selector`);
        if (k === 'key' && (typeof st.key !== 'string' || !st.key)) bad.push(`${at}.key must be a key name (Tab, Enter, Escape, ArrowDown...)`);
        if (k === 'type' && typeof st.type !== 'string') bad.push(`${at}.type must be text`);
        if (k === 'scroll' && !Number.isFinite(st.to)) bad.push(`${at}.to must be a number of px`);
        if (k === 'set' && (typeof st.attr === 'string') === (typeof st.prop === 'string')) bad.push(`${at} needs exactly one of attr or prop`);
        if (k === 'resize' && !(Number.isFinite(st.resize) && st.resize > 0)) bad.push(`${at}.resize must be a width in px`);
        if (k === 'wait' && st.wait !== 'settle' && !(Number.isFinite(st.wait) && st.wait >= 0 && st.wait <= 5000)) bad.push(`${at}.wait must be "settle" or milliseconds (at most 5000)`);
        if (k === 'shot') {
            if (typeof st.shot !== 'string' || !SLUG.test(st.shot)) bad.push(`${at}.shot must be a lowercase slug naming the state ("open", "scrolled")`);
            else if (shots.has(st.shot)) bad.push(`${at}.shot "${st.shot}" is used twice`);
            else shots.add(st.shot);
        }
    });
    if (!shots.size) bad.push('at least one { shot } step: a scenario that is never looked at proves nothing');
    return bad;
}

/** The steps that run in one viewport. Pure. */
export const stepsFor = (scenario, viewport) => scenario.steps.filter(s => !s.on || s.on.includes(viewport));

/** The viewport and theme combinations a scenario is rendered in: [{ viewport, theme }]. Pure. */
export function combinations(scenario, viewports, themes) {
    const vps = viewports.filter(v => !scenario.viewports || scenario.viewports.includes(v.name));
    const ths = themes.filter(t => !scenario.themes || scenario.themes.includes(t));
    return vps.flatMap(viewport => ths.map(theme => ({ viewport, theme })));
}

/** Scenarios to run: those named, or (no names) those whose elements intersect `elements`, or (every) all of them. Unknown names are an error. Pure. */
export function selectScenarios(all, { names = null, elements = [], every = false } = {}) {
    if (names) {
        const bad = names.filter(n => !all.some(s => s.name === n));
        if (bad.length) throw new Error(`no such scenario: ${bad.join(', ')} (known: ${all.map(s => s.name).join(', ')})`);
        return all.filter(s => names.includes(s.name));
    }
    if (every) return all;
    return all.filter(s => s.elements.some(e => elements.includes(e)));
}

/** The screenshot file of a scenario shot. Pure. */
export const scenarioShotName = (scenario, shot, viewport, theme) => `scenario-${scenario}__${shot}__${viewport}__${theme}.png`;

/** A failed expectation as a review finding (an error with a FIX line, like the audits). Pure. */
export const expectationFinding = (scenario, shot, failure) => ({
    rule: 'scenario-expectation', severity: failure.severity ?? 'error', path: `${scenario} / ${shot}`, message: failure.message,
    fix: failure.fix ?? `the scenario core/tests/review/scenarios/${scenario}.js states what this state must look like: fix the element (never the expectation), then run node scripts/ui-review.mjs --scenarios ${scenario}`,
});

const KEYS = {
    Tab: [9, 'Tab'], Enter: [13, 'Enter', '\r'], Escape: [27, 'Escape'], ' ': [32, 'Space', ' '], Backspace: [8, 'Backspace'], Shift: [16, 'ShiftLeft'],
    ArrowLeft: [37, 'ArrowLeft'], ArrowUp: [38, 'ArrowUp'], ArrowRight: [39, 'ArrowRight'], ArrowDown: [40, 'ArrowDown'], Home: [36, 'Home'], End: [35, 'End'],
};
const MODS = { Alt: 1, Control: 2, Meta: 4, Shift: 8 };

/** The DevTools Input.dispatchKeyEvent calls that press and release one key ("Tab", "Shift+Tab", "ArrowDown"). An unknown key is an error. Pure. */
export function keyEvents(spec) {
    const parts = spec.split('+');
    const key = parts.pop() || '+';
    const modifiers = parts.reduce((m, p) => { if (!MODS[p]) throw new Error(`unknown modifier "${p}" in key "${spec}"`); return m | MODS[p]; }, 0);
    const k = KEYS[key];
    if (!k && key.length !== 1) throw new Error(`unknown key "${key}" (known: ${Object.keys(KEYS).join(', ')} or one character)`);
    const [vk, code, text] = k ?? [key.toUpperCase().charCodeAt(0), `Key${key.toUpperCase()}`, key];
    const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
    return [{ ...base, type: text && !modifiers ? 'keyDown' : 'rawKeyDown', ...(text && !modifiers ? { text } : {}) }, { ...base, type: 'keyUp' }];
}

/** The pointer events of a hover (move) or a click (move, press, release) at a point. Pure. */
export function mouseEvents(kind, x, y) {
    const move = { type: 'mouseMoved', x, y, button: 'none' };
    if (kind === 'hover') return [move];
    return [move, { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }, { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }];
}

const r1 = v => Math.round(v * 10) / 10;

/**
 * The helpers of expect(t). env reads the page: { rect(sel) -> {x,y,width,height} | null, clipBoxes(sel) -> the boxes of the clipping ancestors, metric(sel, name) -> a scroll metric, count(sel), visible(sel), text(sel), style(sel, prop), attr(sel, name), viewport }.
 * Every helper records a failure (message, optional fix) instead of throwing, so one run lists all the broken expectations. Returns { t, failures }.
 */
export function createExpectations(env, context = {}) {
    const failures = [];
    const fail = (message, fix) => { failures.push(fix ? { message, fix } : { message }); return false; };
    const box = sel => {
        const r = env.rect(sel);
        if (!r) { fail(`${sel} was not found (or has no box)`); return null; }
        return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.x + r.width, bottom: r.y + r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    };
    const t = {
        ...context,
        /** A plain condition. */
        ok: (cond, message, fix) => Boolean(cond) || fail(message, fix),
        /** A defect that is already filed as an issue: it shows as a warning (never fails the run) and turns into t.ok once the issue is fixed. */
        known: (issue, cond, message) => {
            if (cond) return true;
            failures.push({ message: `known issue #${issue}: ${message}`, severity: 'warn', fix: `tracked in issue #${issue}; when it is fixed, change t.known to t.ok in the scenario so it cannot come back` });
            return false;
        },
        exists: sel => env.count(sel) > 0 || fail(`${sel} does not exist`),
        absent: sel => env.count(sel) === 0 || fail(`${sel} exists but should not`),
        /** Rendered with a box, not display:none, hidden or visibility:hidden. */
        visible: (sel, what = sel) => env.visible(sel) || fail(`${what} is not visible (${env.describe?.(sel) ?? 'no detail'})`),
        hidden: (sel, what = sel) => !env.visible(sel) || fail(`${what} is visible but should be hidden (${env.describe?.(sel) ?? 'no detail'})`),
        /** Whether the element is rendered (a probe: records nothing when it is not). */
        shown: sel => env.visible(sel),
        rect: sel => box(sel),
        text: sel => env.text(sel),
        style: (sel, prop) => env.style(sel, prop),
        attr: (sel, name) => env.attr(sel, name),
        /** The element's text contains `part`. */
        hasText: (sel, part) => env.text(sel).includes(part) || fail(`${sel} says "${env.text(sel).slice(0, 60)}", expected it to contain "${part}"`),
        /** inner lies inside outer, with `tol` px of slack. */
        within: (inner, outer, tol = 1) => {
            const a = box(inner), b = box(outer); if (!a || !b) return false;
            return (a.x >= b.x - tol && a.y >= b.y - tol && a.right <= b.right + tol && a.bottom <= b.bottom + tol) || fail(`${inner} [${r1(a.x)},${r1(a.y)} ${r1(a.width)}x${r1(a.height)}] is not inside ${outer} [${r1(b.x)},${r1(b.y)} ${r1(b.width)}x${r1(b.height)}]`);
        },
        /** The element is fully on screen (not cut off by the viewport). */
        inViewport: (sel, tol = 1) => {
            const a = box(sel); if (!a) return false;
            const v = env.viewport;
            return (a.x >= -tol && a.y >= -tol && a.right <= v.width + tol && a.bottom <= v.height + tol) || fail(`${sel} [${r1(a.x)},${r1(a.y)} to ${r1(a.right)},${r1(a.bottom)}] is cut off by the ${v.width}x${v.height} viewport`);
        },
        noOverlap: (a, b, tol = 1) => {
            const p = box(a), q = box(b); if (!p || !q) return false;
            const w = Math.min(p.right, q.right) - Math.max(p.x, q.x), h = Math.min(p.bottom, q.bottom) - Math.max(p.y, q.y);
            return !(w > tol && h > tol) || fail(`${a} and ${b} overlap by ${r1(w)}x${r1(h)}px`);
        },
        /** a's top edge touches b's bottom edge (flush under it), within tol. */
        flushBelow: (a, b, tol = 1) => {
            const p = box(a), q = box(b); if (!p || !q) return false;
            return Math.abs(p.y - q.bottom) <= tol || fail(`${a} starts at y=${r1(p.y)}, expected flush under ${b} which ends at y=${r1(q.bottom)}`);
        },
        /** a and b sit on one row: their vertical centres agree within tol. */
        sameRow: (a, b, tol = 4) => {
            const p = box(a), q = box(b); if (!p || !q) return false;
            return Math.abs(p.cy - q.cy) <= tol || fail(`${a} (centre y=${r1(p.cy)}) and ${b} (centre y=${r1(q.cy)}) are not on one row`);
        },
        /** a is horizontally centred in b within tol. */
        centredIn: (a, b, tol = 2) => {
            const p = box(a), q = box(b); if (!p || !q) return false;
            return Math.abs(p.cx - q.cx) <= tol || fail(`${a} is centred at x=${r1(p.cx)}, ${b} at x=${r1(q.cx)}`);
        },
        /** a's width or height is at least min px. */
        atLeast: (sel, dim, min) => {
            const a = box(sel); if (!a) return false;
            return a[dim] >= min - 0.5 || fail(`${sel} is ${r1(a[dim])}px ${dim}, expected at least ${min}px`);
        },
        /** A scroll metric of an element: scrollTop, scrollHeight, clientHeight, scrollWidth, clientWidth. */
        metric: (sel, name) => env.metric(sel, name),
        /** The element scrolls (its content is taller than its box). */
        scrolls: sel => env.metric(sel, 'scrollHeight') > env.metric(sel, 'clientHeight') + 1 || fail(`${sel} does not scroll: its content is ${env.metric(sel, 'scrollHeight')}px in a ${env.metric(sel, 'clientHeight')}px box`),
        /** A CSS property has a value. */
        styleIs: (sel, prop, value) => env.style(sel, prop) === value || fail(`${sel} has ${prop}: ${env.style(sel, prop)}, expected ${value}`),
        /** The element shows a focus ring: an outline with a width, or a box-shadow. */
        ringVisible: sel => {
            const w = parseFloat(env.style(sel, 'outline-width')), st = env.style(sel, 'outline-style');
            const shadow = env.style(sel, 'box-shadow');
            return (st !== 'none' && w > 0) || (shadow && shadow !== 'none') || fail(`${sel} shows no focus ring (outline ${st} ${w}px, box-shadow ${shadow})`);
        },
        /** The focus ring (outline plus its offset) fits inside every ancestor that clips (overflow hidden, auto, clip) and the viewport. */
        ringUnclipped: sel => {
            const a = box(sel); if (!a) return false;
            const out = (parseFloat(env.style(sel, 'outline-offset')) || 0) + (parseFloat(env.style(sel, 'outline-width')) || 0);
            const ring = { x: a.x - out, y: a.y - out, right: a.right + out, bottom: a.bottom + out };
            const v = env.viewport;
            const cut = [...env.clipBoxes(sel), { x: 0, y: 0, width: v.width, height: v.height }].find(c => ring.x < c.x - 0.5 || ring.y < c.y - 0.5 || ring.right > c.x + c.width + 0.5 || ring.bottom > c.y + c.height + 0.5);
            return !cut || fail(`the focus ring of ${sel} (${r1(ring.x)},${r1(ring.y)} to ${r1(ring.right)},${r1(ring.bottom)}) is cut off by a box at ${r1(cut.x)},${r1(cut.y)} ${r1(cut.width)}x${r1(cut.height)}`);
        },
    };
    return { t, failures };
}
