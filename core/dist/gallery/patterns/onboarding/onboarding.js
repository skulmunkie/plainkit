// The onboarding pattern, made live: Start completes the current step, the stepper moves on, and the progress bar, the "n of m done" text
// and the list of next steps follow it. After the last step the list says the setup is finished.
// mount(root) works on this sample's own DOM and returns { destroy() }.
import { createLogger } from '../../../js/log.js';

const log = createLogger('pattern:onboarding');

export default function mount(root) {
    const ac = new AbortController();
    const stepper = root.querySelector('[data-stepper]');
    const progress = root.querySelector('[data-progress]');
    const count = root.querySelector('[data-done]');
    const list = root.querySelector('[data-next]');
    if (!stepper || !progress || !list) { log.warn('the onboarding sample needs [data-stepper], [data-progress] and [data-next]', { root }); return { destroy() {} }; }

    const titles = [...stepper.querySelectorAll('pk-step')].map(s => s.getAttribute('heading') ?? '');
    let done = Number(stepper.getAttribute('current')) || 0; // steps completed: the stepper's current step is the first one not done
    const row = (text, { start = false, muted = false } = {}) => {
        const d = document.createElement('div');
        if (muted) d.className = 'muted';
        d.append(text);
        if (start) {
            const b = document.createElement('pk-button');
            b.setAttribute('size', 'mini'); b.setAttribute('data-start', ''); b.textContent = 'Start';
            d.append(' ', b);
        }
        return d;
    };
    const paint = () => {
        progress.setAttribute('value', String(Math.round((done / titles.length) * 100)));
        if (count) count.textContent = `${done} of ${titles.length} done`;
        list.replaceChildren(...(done >= titles.length ? [row('All steps are done.')] : [row(titles[done], { start: true }), ...titles.slice(done + 1).map(t => row(t, { muted: true }))]));
    };

    root.addEventListener('click', e => {
        if (!e.target.closest?.('[data-start]') || done >= titles.length) return;
        done += 1;
        // The stepper has no step after the last one, so it stays on it; the rest of the sample shows that everything is done.
        // The stepper is linear (its next() will not skip ahead) and this sample is the host, so it sets the step it now shows.
        if (done < titles.length) stepper.current = done;
        paint();
    }, { signal: ac.signal });
    // A step the reader picks in the stepper (when it is made clickable) moves the checklist with it.
    stepper.addEventListener('pk-step-change', e => { done = e.detail.index; paint(); }, { signal: ac.signal });

    paint();
    return { destroy() { ac.abort(); } };
}
