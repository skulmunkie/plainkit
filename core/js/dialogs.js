// A modal factory over pk-dialog (#373, step of the app framework #346): confirm, alert, prompt and a small config-driven form dialog, each a promise, so a module
// never writes dialog markup. Framework-free (no import but the logger).
//
//   import { createDialogs } from './dialogs.js';
//   const dialogs = createDialogs({ container });
//   await dialogs.confirm({ heading: 'Delete order 1042?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true });  // true | false
//   await dialogs.alert({ heading: 'Export finished', message: '312 rows.' });                                                          // undefined
//   await dialogs.prompt({ heading: 'Rename', label: 'Name', value: 'Draft', required: true, maxLength: 80 });                         // the text | null
//   await dialogs.open({ heading: 'New customer', message: '…', template: 'tpl-id',                                                   // a <template> already in the DOM, cloned
//       fields: [{ name: 'email', label: 'Email', type: 'email', required: true }], actions: [{ label: 'Create', value: 'ok' }],
//       validate: values => (values.email.includes('@') ? '' : 'Enter an email address.') });                                           // { action, values } | null (cancelled)
//
// One dialog is open at a time for the whole app (one manager per app): a call while one is open QUEUES and opens when it closes. Policy: Escape and the close
// button cancel; the backdrop does not (pk-dialog's house rule) unless config.backdrop is true; config.blocking removes all three, so only an action closes it.
// Focus: the native modal traps it and makes the page inert; the first field (or the safe button: Cancel of a danger confirm, else the confirming one) gets it,
// and on close it goes back to the element that had it when the dialog opened. Full screen on a phone is pk-dialog's own (below 640px).
// Text is untrusted: every string goes in with textContent and properties; a template is cloned, never parsed from a string.
//
// Scopes. dialogs.scope() returns { confirm, alert, prompt, open, end }. end() (the page or module unmounts) CANCELS its dialogs: the open one closes and resolves as
// cancelled (false / undefined / null), the queued ones resolve the same without opening. destroy() does that for all. A throwing config, template or validate()
// is logged and the dialog resolves as cancelled (validate throwing keeps the dialog open); the shell never sees the throw.
import { createLogger } from './log.js';

const CANCELLED = { confirm: false, alert: undefined, prompt: null, open: null };

export function createDialogs({ container, log = createLogger('dialogs'), load } = {}) {
    const doc = container?.ownerDocument ?? globalThis.document;
    const queue = [];
    let current = null, dead = false;

    const el = (tag, props = {}) => Object.assign(doc.createElement(tag), props);
    function fieldsOf(kind, c) {
        if (kind === 'prompt') return [{ name: 'value', label: c.label ?? c.heading ?? 'Value', value: c.value, placeholder: c.placeholder, required: c.required, maxLength: c.maxLength }];
        return kind === 'open' && Array.isArray(c.fields) ? c.fields : [];
    }
    function actionsOf(kind, c) {
        const ok = { label: c.confirmLabel ?? (kind === 'confirm' ? 'Confirm' : 'OK'), value: 'ok', variant: c.danger ? 'warn' : 'primary' };
        if (kind === 'alert') return [ok];
        if (kind === 'open' && Array.isArray(c.actions) && c.actions.length) return [{ label: c.cancelLabel ?? 'Cancel', value: '', variant: 'ghost' }, ...c.actions];
        return [{ label: c.cancelLabel ?? 'Cancel', value: '', variant: 'ghost' }, ok];
    }

    // Builds the pk-dialog of one request, wires it, opens it. Every listener is on the dialog itself, which is removed on close.
    function build(req) {
        const { kind, config: c } = req;
        const d = el('pk-dialog', { heading: clipS(c.heading, 200), size: ['sm', 'md', 'lg'].includes(c.size) ? c.size : 'sm' });
        if (c.blocking) d.hideClose = true;
        if (c.message) d.append(el('p', { textContent: clipS(c.message, 2000) }));
        if (kind === 'open' && c.template) {
            const tpl = doc.getElementById(String(c.template));
            if (tpl?.localName !== 'template') throw new Error(`dialogs.open: no <template id="${c.template}"> in the page`);
            d.append(tpl.content.cloneNode(true));
        }
        const inputs = fieldsOf(kind, c).map(f => {
            const input = el('pk-input', { name: String(f.name), value: String(f.value ?? ''), placeholder: clipS(f.placeholder, 200) });
            if (['email', 'url', 'tel', 'number', 'password', 'date'].includes(f.type)) input.type = f.type;
            const field = el('pk-field', { label: clipS(f.label ?? f.name, 200), help: clipS(f.help, 300), required: !!f.required });
            field.append(input); d.append(field);
            return { f, input, field };
        });
        const buttons = actionsOf(kind, c).map(a => { const b = el('pk-button', { slot: 'footer', textContent: clipS(a.label, 80) }); b.setAttribute('variant', a.variant ?? 'primary'); b.dataset.result = String(a.value ?? 'ok'); d.append(b); return b; });
        const values = () => Object.fromEntries(inputs.map(({ f, input }) => [String(f.name), String(input.value ?? '').trim()]));
        const problem = () => {
            let bad = false;
            for (const { f, input, field } of inputs) {
                const v = String(input.value ?? '').trim();
                field.error = f.required && !v ? 'This field is required.' : f.maxLength > 0 && v.length > f.maxLength ? `Use at most ${f.maxLength} characters.` : '';
                if (field.error && !bad) { bad = true; input.focus?.(); }
            }
            if (bad || typeof c.validate !== 'function') return bad;
            try { const msg = c.validate(values()); if (msg) { (inputs[0]?.field ?? {}).error = clipS(msg, 300); return true; } } catch (e) { log.error('a dialog validate() threw; the dialog stays open', e); return true; }
            return false;
        };
        const choose = r => { if (r && problem()) return; req.result = r; d.open = false; };
        const first = inputs[0]?.input ?? (kind === 'confirm' && c.danger ? buttons[0] : buttons.at(-1));
        const on = (type, fn) => { d.addEventListener(type, fn); req.offs.push(() => d.removeEventListener(type, fn)); };
        on('click', e => {
            const r = e.target?.closest?.('[data-result]')?.dataset.result;
            if (r !== undefined) choose(r);
            else if (c.backdrop && !c.blocking && e.composedPath?.()[0]?.localName === 'dialog') choose('');
        });
        on('keydown', e => { if (e.key === 'Enter' && e.target?.localName === 'pk-input') { e.preventDefault(); choose(buttons.at(-1).dataset.result); } });
        on('pk-close', e => { if (c.blocking) e.preventDefault(); else req.result = ''; });
        on('close', () => settle(req));
        on('pk-open', () => first.focus?.()); // pk-dialog raises it once showModal ran, so focus lands inside the open modal
        req.values = values; req.dialog = d; req.trigger = doc.activeElement ?? null;
        (container ?? doc.body).append(d);
        d.open = true;
        // pk-open focuses at once when the elements are defined; a field defined later is focused once the load resolves (unless focus already moved to one of its controls)
        if (load) Promise.resolve(load(d)).then(() => { const a = doc.activeElement; if (!req.done && (a === d || !d.contains?.(a))) first.focus?.(); }, e => log.error('could not load the elements of a dialog', e));
    }
    const clipS = (v, n) => String(v ?? '').slice(0, n);

    function settle(req) {
        if (req.done) return;
        req.done = true;
        const ok = !!req.result, k = req.kind;
        const value = !ok ? CANCELLED[k] : k === 'confirm' ? true : k === 'alert' ? undefined : k === 'prompt' ? req.values().value : { action: req.result, values: req.values() };
        req.scope?.mine.delete(req);
        if (req.dialog) {
            for (const off of req.offs) off();
            req.dialog.remove();
            if (req.trigger?.isConnected) req.trigger.focus?.();
        }
        if (current === req) current = null;
        req.resolve(value);
        pump();
    }
    function pump() {
        while (!dead && !current && queue.length) {
            const req = current = queue.shift();
            try { build(req); } catch (e) { log.error(`a ${req.kind} dialog could not open; it resolves as cancelled`, e); req.dialog?.remove(); req.dialog = null; req.result = ''; settle(req); }
        }
    }
    function ask(kind, config, sc) {
        if (dead || sc?.ended) { log.warn(`dialogs.${kind}() after the end of its scope was ignored`); return Promise.resolve(CANCELLED[kind]); }
        return new Promise(resolve => {
            const req = { kind, config: config && typeof config === 'object' ? config : {}, resolve, scope: sc, result: '', done: false, offs: [] };
            sc?.mine.add(req);
            queue.push(req);
            pump();
        });
    }
    const cancel = req => { const i = queue.indexOf(req); if (i >= 0) { queue.splice(i, 1); req.result = ''; settle(req); } else if (req.dialog && !req.done) { req.result = ''; req.dialog.open = false; settle(req); } };
    const api = sc => Object.fromEntries(Object.keys(CANCELLED).map(kind => [kind, config => ask(kind, config, sc)]));

    return {
        ...api(null),
        scope() {
            const sc = { mine: new Set(), ended: false };
            // the queued ones first, so ending the scope never opens one of its own dialogs on the way
            return { ...api(sc), end() { sc.ended = true; const mine = [...sc.mine]; for (const r of mine.filter(x => !x.dialog)) cancel(r); for (const r of mine) if (!r.done) cancel(r); } };
        },
        destroy() {
            if (dead) return;
            dead = true;
            for (const r of [...queue]) cancel(r);
            if (current) cancel(current);
        },
        get isOpen() { return !!current; },
        get queued() { return queue.length; },
    };
}
