// pk-field around pk-input in its validation states (issue 268 and the form-error class of defect): a long label that wraps, the required star, an error message
// that is visible, inside the field and wired to the control (aria-invalid, aria-description), a warning, the counter that turns over its maximum, disabled and read-only
// with copy, and an error that appears later (set from outside) without the control moving out of the page. Focus rings on the invalid control stay visible.
const LABEL = 'Product title as it is shown on the storefront, invoices and the packing slip';
const INVALID_ISSUE = 341; // filed defect (t.known: a warning); change to t.ok when fixed
const inner =id => `#${id} >>> [part=control]`;

export default {
    name: 'field-validation',
    issue: [268],
    elements: ['field', 'input'],
    html: `<div class="u-p-1r-1p25r"><pk-form><pk-stack>
<pk-field id="f1" label="${LABEL}" required help="Up to 80 characters." error="Enter a title of at least 3 characters."><pk-input id="i1" value="ab"></pk-input></pk-field>
<pk-field id="f2" label="Weight" warning="Heavier than the usual 5 kg parcel limit."><pk-input id="i2" value="6.4"></pk-input></pk-field>
<pk-field id="f3" label="Short description" max="20" help="Shown in search results."><pk-input id="i3" value="Summer"></pk-input></pk-field>
<pk-field id="f4" label="SKU" layout="row"><pk-input id="i4" value="AC-1001" readonly copyable></pk-input></pk-field>
<pk-field id="f5" label="Supplier reference"><pk-input id="i5" value="Locked by import" disabled></pk-input></pk-field>
<pk-field id="f6" label="Barcode" help="Scanned or typed."><pk-input id="i6" value="0123 4567"></pk-input></pk-field>
</pk-stack></pk-form></div>`,
    steps: [
        { shot: 'rest' },
        { focus: '#i1 >>> input' }, { shot: 'error-focus' },
        { focus: '#i3 >>> input' }, { type: ' collection for 2026' }, { wait: 200 }, { shot: 'counter-over' },
        { set: '#f6', attr: 'error', value: 'A barcode has no spaces.' }, { wait: 300 }, { shot: 'error-added' },
    ],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways (a long label or message runs out of the form)');
        for (const id of ['f1', 'f2', 'f3', 'f4', 'f5', 'f6']) { t.inViewport(`#${id}`, 1); }
        // The long label wraps inside its field and keeps the star.
        t.visible('#f1 >>> [part=label]', 'the long label'); t.within('#f1 >>> [part=label]', '#f1', 1);
        t.visible('#f1 >>> [part=required]', 'the required star'); t.within('#f1 >>> [part=required]', '#f1', 1);
        t.ok(t.metric('#f1 >>> [part=label]', 'scrollWidth') <= t.metric('#f1 >>> [part=label]', 'clientWidth') + 1, 'the long label runs out of its box');
        // The error: visible, inside the field, below the control, and wired to it.
        t.visible('#f1 >>> [part=error]', 'the error message'); t.within('#f1 >>> [part=error]', '#f1', 1);
        t.noOverlap('#f1 >>> [part=error]', '#i1'); t.noOverlap('#f1 >>> [part=help]', '#f1 >>> [part=error]');
        t.hasText('#f1 >>> [part=error]', 'at least 3 characters');
        const invalid = t.attr(inner('i1'), 'aria-invalid') === 'true'; // a race in the load order (filed defect)
        t.known(INVALID_ISSUE, invalid, 'the control of a field with an error is not aria-invalid (the field wired it before the input upgraded)');
        t.ok((t.attr(inner('i1'), 'aria-description') ?? '').includes('at least 3 characters'), 'the error text is not exposed to the control (aria-description)');
        t.ok((t.attr(inner('i1'), 'aria-label') ?? '').startsWith('Product title'), 'the control has no accessible name from the field label');
        if (t.shot !== 'error-added' && invalid) t.ok(t.style('#i1 >>> [part=box]', 'border-top-color') !== t.style('#i3 >>> [part=box]', 'border-top-color'), 'the invalid box has the same border colour as a valid one');
        t.visible('#f2 >>> [part=warning]', 'the warning'); t.within('#f2 >>> [part=warning]', '#f2', 1);
        t.ok(t.attr(inner('i2'), 'aria-invalid') !== 'true', 'a warning must not mark the control as invalid');
        t.atLeast('#i1', 'height', t.viewport.name === 'phone' ? 44 : 30);
        // Disabled and read-only.
        t.ok(t.attr(inner('i5'), 'disabled') !== null, 'the disabled input is not disabled');
        t.ok(t.attr(inner('i4'), 'readonly') !== null, 'the read-only input is not read-only');
        t.visible('#i4 >>> [part=copy]', 'the copy button'); t.within('#i4 >>> [part=copy]', '#i4 >>> [part=box]', 1); t.atLeast('#i4 >>> [part=copy]', 'width', t.viewport.name === 'phone' ? 40 : 24);
        t.noOverlap('#f4 >>> [part=label]', '#i4');
        if (t.shot === 'error-focus') { t.ringVisible('#i1 >>> [part=box]'); t.ringUnclipped('#i1 >>> [part=box]'); }
        if (t.shot === 'counter-over') {
            t.visible('#f3 >>> [part=count]', 'the counter'); t.hasText('#f3 >>> [part=count]', '/ 20') || t.hasText('#f3 >>> [part=count]', '/20');
            t.within('#f3 >>> [part=count]', '#f3', 1); t.noOverlap('#f3 >>> [part=count]', '#f3 >>> [part=help]');
        }
        if (t.shot === 'error-added') { t.visible('#f6 >>> [part=error]', 'the error set later'); t.hasText('#f6 >>> [part=error]', 'no spaces'); t.within('#f6 >>> [part=error]', '#f6', 1); t.ok(t.attr(inner('i6'), 'aria-invalid') === 'true', 'setting the error later does not mark the control invalid'); }
    },
};
