// Parts of pk-field-group kept out of its file for the gzip budget: async commit and suffixAction (#1725).
import { loadElements } from './loader.js';

export async function commitAsync(group, row) {
    const n = row.c = (row.c ?? 0) + 1, key = row.spec.key, { control, field } = row, value = group.$vals[key];
    field.error = ''; control.setAttribute('aria-busy', 'true');
    if (!field.querySelector('[data-busy]')) { field.append(group.mk('pk-spinner', { size: 'sm', label: 'Saving', slot: 'label-action', 'data-busy': '' })); loadElements(group.shadowRoot); }
    let error = '';
    try { const answer = await group.commit({ key, value, values: { ...group.$vals } }); if (typeof answer === 'string') error = answer; } catch (e) { error = e?.message || 'The change could not be saved.'; group.log.warn(`commit for "${key}" failed`, e); }
    if (row.c !== n || group.$rows.get(key) !== row) return;
    control.removeAttribute('aria-busy'); field.querySelector('[data-busy]')?.remove();
    if (error) field.error = error; else group.announce(key);
}

// suffixAction { icon, label, key }: an icon button in a pk-input's suffix slot; raises pk-field-action.
export function attachSuffix(group, row) {
    const { spec, control } = row, a = spec.suffixAction;
    if (control.localName !== 'pk-input' || !a?.icon || !a.label || !a.key) { group.warnOnce(`suffix:${spec.key}`, `suffixAction of "${spec.key}" needs icon, label and key, and an input kind; ignored.`); return; }
    const b = group.mk('pk-button', { slot: 'suffix', icon: '', 'icon-name': a.icon, label: a.label, variant: 'ghost', size: 'sm', type: 'button' });
    b.addEventListener('click', () => group.emit('pk-field-action', { key: spec.key, action: a.key }));
    control.append(b);
    // The button follows the control: the group writes disabled and readonly on the control, whenever its state changes.
    const follow = () => b.toggleAttribute('disabled', control.hasAttribute('disabled') || control.hasAttribute('readonly'));
    new MutationObserver(follow).observe(control, { attributes: true, attributeFilter: ['disabled', 'readonly'] });
    follow();
}
