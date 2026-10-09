// The text of a control's constraint-validation problem, shared by pk-form (the summary and the messages in the fields) and pk-field-group (its aggregate
// validity). The browser decides what is invalid; this only picks the words.
const KEYS = [['valueMissing', 'required'], ['typeMismatch', 'type'], ['patternMismatch', 'pattern'], ['tooShort', 'minlength'], ['tooLong', 'maxlength'], ['rangeUnderflow', 'min'], ['rangeOverflow', 'max'], ['stepMismatch', 'step'], ['badInput', 'bad-input'], ['customError', 'custom']];

/** '' when the control is valid; otherwise its data-msg-<constraint>, else data-msg, else the browser's own text. */
export function messageFor(control) {
    const v = control.validity;
    if (!v || v.valid !== false) return '';
    const fallback = control.getAttribute('data-msg') ?? control.validationMessage ?? 'Enter a valid value.';
    for (const [flag, key] of KEYS) if (v[flag]) return control.getAttribute(`data-msg-${key}`) ?? fallback;
    return fallback;
}
