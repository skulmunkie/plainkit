// The reconnect banner's measuring cases of scripts/blazor-browser.mjs (#1714, phase 3): its layout at desktop and phone, and the three paths that need the server to really go away and come back:
// `rejected` end to end, the automatic reload landing on a fresh circuit, and the loop guard. The host-restart cases stop the sample's host process and start it again on the same port
// (host.restart(), blazor-browser.mjs), so they run LAST: every case before them keeps the one host it started with. Same rules as the other case files: a failing case is a defect, never weaken it.
import { BENIGN, onPhone } from './blazor-browser-lab-cases.mjs';

const MODAL = `document.getElementById('components-reconnect-modal')`;
const BAR = `${MODAL}?.querySelector('[data-part="bar"]')`;
const NAVBAR = `window.__deep.all('pk-navbar')[0]`; // the app frame's bar: what the banner must not cover on a desktop
const KIND = `(${MODAL}?.dataset.kind ?? '')`;
const COUNT = `(${MODAL}?.querySelector('[data-part="detail"]')?.textContent ?? '')`;
const GUARD_KEY = 'pk-reconnect-reloads';
/** Raises a framework state on the modal element, the way .NET 10 does. */
const fire = (ctx, state, extra = '') => ctx.eval(`${MODAL}.dispatchEvent(new CustomEvent('components-reconnect-state-changed', { detail: { state: ${JSON.stringify(state)}${extra} } }))`);
/** Errors the dropped connection logs by itself; anything else is still a failure. */
const DROPPED = [...BENIGN, /Connection disconnected|WebSocket|negotiat|Failed to (start|complete|fetch)|ERR_CONNECTION_REFUSED|Information:/i];

async function barUp(ctx) {
    await ctx.open('/');
    await ctx.waitFor(`!!${BAR}`, 'the reconnect banner to be built');
}

/** After the host is back: the page reloaded and the new circuit answers (its event handlers are registered). */
async function freshCircuit(ctx) {
    await ctx.waitFor(`window.__marker === undefined && document.readyState === 'complete' && !!window.Blazor`, 'the page to reload', 90);
    await ctx.waitInteractive();
    ctx.ok(await ctx.eval(`${BAR}?.hidden !== false`), 'the banner is gone on the new page');
}

export const RECONNECT_CASES = [
    { name: 'reconnect-banner-desktop-layout', // the owner decision: on a desktop the banner reserves its own height; the app bar is not covered and the page does not scroll
      async run(ctx) {
        await barUp(ctx);
        const top0 = await ctx.eval(`${NAVBAR}.getBoundingClientRect().top`);
        for (const state of ['retrying', 'failed', 'rejected']) {
            await fire(ctx, state);
            await ctx.waitFor(`${KIND} !== ''`, `the ${state} banner`);
            await ctx.sleep(200);
            const m = await ctx.eval(`(() => { const b = ${BAR}.getBoundingClientRect(), n = ${NAVBAR}.getBoundingClientRect(); return { barTop: b.top, barBottom: b.bottom, barWidth: b.width, navTop: n.top, vw: innerWidth, scroll: document.documentElement.scrollHeight - innerHeight }; })()`);
            ctx.ok(m.barTop <= 1 && m.barBottom > 10 && m.barWidth >= m.vw - 1, `${state}: the banner spans the top (${JSON.stringify(m)})`);
            ctx.ok(m.navTop >= m.barBottom - 1, `${state}: the app bar starts at ${m.navTop}, under the banner's bottom ${m.barBottom}: it is covered`);
            ctx.ok(m.scroll <= 1, `${state}: the page scrolls by ${m.scroll} px because the banner took height the app did not give up`);
            await fire(ctx, 'hide'); await ctx.waitFor(`${BAR}.hidden`, 'the banner to hide');
        }
        await ctx.waitFor(`Math.abs(${NAVBAR}.getBoundingClientRect().top - ${top0}) <= 1`, 'the app bar to go back to the top when the banner hides');
        ctx.ok(await ctx.eval(`!document.documentElement.hasAttribute('data-pk-reconnect-open')`), 'the page is not left reserving the banner height');
        await ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'reconnect-banner-phone-icons', // icons only on a phone (the buttons keep their names), text on a desktop; on the phone the banner is the top layer
      async run(ctx) {
        await barUp(ctx);
        const btn = n => `${MODAL}.querySelector('[data-act="${n}"]')`;
        await fire(ctx, 'failed'); await ctx.waitFor(`${KIND} === 'failed'`, 'the failed banner');
        ctx.ok(await ctx.eval(`!${btn('reload')}.hasAttribute('icon') && ${btn('reload')}.textContent.trim() === 'Reload'`), 'a desktop button shows its text');
        await onPhone(ctx, async () => {
            await ctx.open('/'); await ctx.waitFor(`!!${BAR}`, 'the banner on the phone');
            await fire(ctx, 'failed'); await ctx.waitFor(`${KIND} === 'failed'`, 'the failed banner on the phone');
            await ctx.sleep(200);
            const m = await ctx.eval(`(() => { const out = {}; for (const n of ['tryNow', 'reload']) { const b = ${MODAL}.querySelector('[data-act="' + n + '"]'), r = b.getBoundingClientRect(); out[n] = { icon: b.hasAttribute('icon'), name: b.textContent.trim(), glyph: !!b.querySelector('pk-icon'), w: r.width, h: r.height }; } const bar = ${BAR}.getBoundingClientRect(); out.bar = { top: bar.top, w: bar.width }; out.vw = innerWidth; out.scrollX = document.documentElement.scrollWidth - innerWidth; return out; })()`);
            for (const n of ['tryNow', 'reload']) {
                ctx.ok(m[n].icon && m[n].glyph && m[n].name.length > 0, `phone ${n}: an icon button with an accessible name (${JSON.stringify(m[n])})`);
                ctx.ok(m[n].w >= 40 && m[n].h >= 43 && m[n].w <= 64, `phone ${n}: a touch-sized square (${m[n].w} x ${m[n].h})`);
            }
            ctx.ok(m.bar.top <= 1 && m.bar.w >= m.vw - 1 && m.scrollX <= 1, `phone: the banner is the top layer and the page does not scroll sideways (${JSON.stringify(m.bar)})`);
            await ctx.noErrors(ctx.openMark, BENIGN);
        });
      } },
    { name: 'reconnect-host-restart-rejected', // the circuit is really gone: the banner shows reconnecting, then the session ended with a visible countdown; Cancel keeps the page, Reload gives a fresh circuit
      async run(ctx) {
        await barUp(ctx);
        await ctx.eval('(window.__marker = 1)');
        await ctx.host.restart();
        await ctx.waitFor(`${KIND} === 'busy' || ${KIND} === 'ended'`, 'the reconnecting banner after the host restarted', 60);
        await ctx.waitFor(`${KIND} === 'ended'`, 'the session-ended banner: the new host does not know the circuit', 120);
        await ctx.waitFor(`/Reloading in \\d/.test(${COUNT})`, 'the visible countdown');
        await ctx.clickDeep('#components-reconnect-modal pk-button', 'Cancel');
        await ctx.waitFor(`!/Reloading in/.test(${COUNT})`, 'Cancel to stop the countdown');
        await ctx.sleep(1500);
        ctx.ok(await ctx.eval('window.__marker === 1'), 'Cancel kept the page');
        await ctx.clickDeep('#components-reconnect-modal pk-button', 'Reload');
        await freshCircuit(ctx);
        await ctx.noErrors(ctx.openMark, DROPPED);
      } },
    { name: 'reconnect-host-restart-auto-reload', // left alone, the ended session reloads by itself and lands on a working circuit; the reload is counted for the loop guard
      async run(ctx) {
        await barUp(ctx);
        await ctx.eval(`(window.__marker = 1, sessionStorage.removeItem(${JSON.stringify(GUARD_KEY)}), true)`);
        await ctx.host.restart();
        await ctx.waitFor(`${KIND} === 'ended'`, 'the session-ended banner', 120);
        await freshCircuit(ctx);
        const n = await ctx.eval(`JSON.parse(sessionStorage.getItem(${JSON.stringify(GUARD_KEY)}) ?? '[]').length`);
        ctx.ok(n === 1, `the automatic reload was counted once for the loop guard, found ${n}`);
        await ctx.noErrors(ctx.openMark, DROPPED);
      } },
    { name: 'reconnect-host-restart-loop-guard', // three automatic reloads in the last minute are used up: the countdown ends in a message, not a fourth reload
      async run(ctx) {
        await barUp(ctx);
        await ctx.eval(`(window.__marker = 1, sessionStorage.setItem(${JSON.stringify(GUARD_KEY)}, JSON.stringify([Date.now() - 3000, Date.now() - 2000, Date.now() - 1000])), true)`);
        await ctx.host.restart();
        await ctx.waitFor(`${KIND} === 'ended'`, 'the session-ended banner', 120);
        await ctx.waitFor(`${MODAL}.textContent.includes('did not help')`, 'the loop guard message after the countdown', 30);
        await ctx.sleep(2000);
        ctx.ok(await ctx.eval('window.__marker === 1'), 'the page was not reloaded a fourth time');
        ctx.ok(await ctx.eval(`!${MODAL}.querySelector('[data-act="reload"]').hidden`), 'Reload stays available by hand');
        await ctx.clickDeep('#components-reconnect-modal pk-button', 'Reload');
        await freshCircuit(ctx);
        await ctx.eval(`(sessionStorage.removeItem(${JSON.stringify(GUARD_KEY)}), true)`);
        await ctx.noErrors(ctx.openMark, DROPPED);
      } },
];

/** Screenshots of the banner at each state on the shell (desktop: the app bar is below it; phone: icons). */
export const RECONNECT_SHOTS = [
    async (ctx, vp, theme) => {
        await barUp(ctx);
        for (const [state, extra, name] of [['retrying', ', currentAttempt: 3', 'busy'], ['failed', '', 'failed'], ['rejected', '', 'ended'], ['paused', '', 'paused']]) {
            await fire(ctx, state, extra);
            await ctx.sleep(500);
            await ctx.shot('reconnect-' + name, vp, theme);
        }
    },
];
