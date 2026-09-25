// The scenario side of the UI review page (review.js loads it for /tests/review/?scenario=<name>&theme=light). It renders the scenario's markup into
// one frame, and gives scripts/ui-review.mjs a small API on window.__rv to drive it: target(step) says where a pointer step lands, apply(step) does the
// DOM steps (focus, scroll, set, resize), check(shot, ctx) runs the scenario's expect(t) and measures the frame for the audits. The pointer and key
// events themselves are real ones sent by the runner over the DevTools protocol (so :hover, :focus-visible and the top layer behave as for a person).
import { createExpectations } from './scenario.js';

/** One selector to its first element; `a >>> b` looks for b in the shadow tree of the first a. */
export function findIn(frame, sel, all = false) {
    const parts = sel.split('>>>').map(s => s.trim());
    let scope = frame;
    for (let i = 0; i < parts.length - 1; i++) {
        const el = scope.querySelector(parts[i]);
        if (!el) return all ? [] : null;
        scope = el.shadowRoot ?? el;
    }
    const last = parts[parts.length - 1];
    return all ? [...scope.querySelectorAll(last)] : scope.querySelector(last);
}

// Everything the frame shows, as one string: every element (through shadow roots) with its attributes and box. Two equal readings a frame apart mean
// the page has stopped changing (an element reflects its properties to attributes and lays out a beat after it is asked to).
function signature(frame) {
    const out = [];
    const walk = node => {
        for (const c of node.children) {
            const r = c.getBoundingClientRect();
            out.push(`${c.localName}${[...c.attributes].map(a => `${a.name}=${a.value}`).join(',')}@${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`);
            if (c.shadowRoot) walk(c.shadowRoot);
            walk(c);
        }
    };
    walk(frame);
    return out.join('|');
}
const tick = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 60)));

export async function startScenario({ name, root, state, measure, settle, loadElements, applyDynamic, registry, log }) {
    if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`"${name}" is not a scenario name`);
    try { localStorage.clear(); } catch (e) { log.debug('storage blocked; scenarios start without saved state', e); }
    const scenario = (await import(`./scenarios/${name}.js`)).default;
    const frame = document.createElement('div');
    frame.className = 'rv-frame';
    frame.id = 'rv-frame';
    frame.append(...new DOMParser().parseFromString(`<body>${scenario.html}`, 'text/html').body.childNodes);
    root.append(frame);
    applyDynamic(frame);
    await loadElements(frame, { registry });
    await Promise.all([...new Set([...frame.querySelectorAll('*')].map(e => e.localName).filter(n => n.includes('-')))].map(n => customElements.whenDefined(n).catch(e => log.warn(`${n} never defined`, e))));
    const quiet = async () => {
        await settle();
        let prev = signature(frame);
        for (let i = 0; i < 40; i++) { await tick(); const now = signature(frame); if (now === prev) return; prev = now; }
        log.warn(`scenario ${name}: the page was still changing after 40 frames`);
    };
    await quiet();

    const find = sel => findIn(frame, sel);
    const boxed = el => el && el.getClientRects().length > 0;
    const env = {
        get viewport() { return { width: innerWidth, height: innerHeight }; },
        rect: sel => { const el = find(sel); if (!boxed(el)) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; },
        clipBoxes: sel => {
            const boxes = [];
            for (let n = find(sel); n; n = n.assignedSlot ?? n.parentElement ?? n.getRootNode()?.host ?? null) {
                if (n === find(sel) || n === document.documentElement) continue;
                const cs = getComputedStyle(n);
                if ([cs.overflowX, cs.overflowY].every(o => o === 'visible')) continue;
                const r = n.getBoundingClientRect();
                boxes.push({ x: r.x, y: r.y, width: r.width, height: r.height });
            }
            return boxes;
        },
        describe: sel => { const el = find(sel); if (!el) return 'not found'; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return `display ${cs.display}, visibility ${cs.visibility}, ${Math.round(r.width)}x${Math.round(r.height)} at ${Math.round(r.x)},${Math.round(r.y)}`; },
        metric: (sel, name) => find(sel)?.[name] ?? 0,
        count: sel => findIn(frame, sel, true).length,
        visible: sel => { const el = find(sel); return Boolean(el) && boxed(el) && (!el.checkVisibility || el.checkVisibility({ visibilityProperty: true })); },
        text: sel => (find(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim(),
        style: (sel, prop) => { const el = find(sel); return el ? getComputedStyle(el).getPropertyValue(prop).trim() : ''; },
        attr: (sel, n) => find(sel)?.getAttribute(n) ?? null,
    };

    const api = {
        name: scenario.name,
        /** Where a pointer step lands: the centre of the element, after scrolling it into view if it is off screen. */
        target(step) {
            const sel = step.click ?? step.hover ?? step.focus;
            const el = find(sel);
            if (!el) return { error: `${sel} was not found` };
            const r0 = el.getBoundingClientRect();
            if (r0.bottom < 0 || r0.top > innerHeight) el.scrollIntoView({ block: 'nearest' });
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) return { error: `${sel} has no box to point at` };
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        },
        /** The DOM steps. */
        async apply(step) {
            if ('resize' in step) { frame.style.width = `${step.resize}px`; }
            else if ('scroll' in step) { const el = find(step.scroll); if (!el) return { error: `${step.scroll} was not found` }; el.scrollTop = step.to; }
            else if ('set' in step) {
                const el = find(step.set);
                if (!el) return { error: `${step.set} was not found` };
                if ('attr' in step) { if (step.value === null || step.value === false) el.removeAttribute(step.attr); else el.setAttribute(step.attr, step.value === true ? '' : String(step.value)); } else el[step.prop] = step.value;
            } else if ('focus' in step) { const el = find(step.focus); if (!el) return { error: `${step.focus} was not found` }; el.focus(); }
            await quiet();
            return {};
        },
        settle: quiet,
        /** Runs the scenario's expectations for one shot and measures the frame. */
        async check(shot, ctx) {
            await quiet();
            const { t, failures } = createExpectations(env, { shot, viewport: ctx.viewport, theme: ctx.theme, frame });
            try { scenario.expect(t); } catch (error) { log.error(`scenario ${name}: expect threw at ${shot}`, error); failures.push({ message: `expect(t) threw at "${shot}": ${error?.message ?? error}` }); }
            const touchTarget = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--touch-target')) || undefined;
            const r = frame.getBoundingClientRect();
            return { failures, facts: { viewport: { width: innerWidth }, touchTarget, docScrollWidth: document.documentElement.scrollWidth, exampleWidth: Math.round(r.width), boxes: measure(frame) }, size: { width: innerWidth, height: innerHeight } };
        },
    };
    window.__rv = api;
}
