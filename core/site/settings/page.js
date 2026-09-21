// The settings page: theme, gallery text size and sample width, and logging. Values live in localStorage through the shared settings helper (logging keeps its own saved configuration, js/log.js).
import { mountShell, readSetting, writeSetting } from '../shell.js';
import { setTheme, currentTheme } from '../../js/theme.js';
import { mountLogSettings } from '../../modules/log-settings/log-settings.js';

mountShell({ page: 'settings', title: null });
const root = document.documentElement;
const $ = s => document.querySelector(s);
const paint = () => document.querySelectorAll('pk-button[value]').forEach(b => b.toggleAttribute('pressed', b.getAttribute('value') === currentTheme(root)));

paint();
// Attributes, not properties: the elements may not be upgraded yet, and a property set now would shadow their accessor.
$('#set-scale').setAttribute('value', readSetting('pk-gallery-scale') ?? '1');
$('#set-width').setAttribute('value', readSetting('pk-gallery-width') === 'phone' ? 'phone' : 'desktop');
$('pk-button-group').addEventListener('pk-toggle', e => {
    const name = e.target.closest('pk-button')?.getAttribute('value');
    if (!name || name === currentTheme(root)) return;
    setTheme(root, name); writeSetting('pk-site-theme', name); paint();
    document.dispatchEvent(new CustomEvent('site-theme', { detail: name }));
    const t = $('#site-theme'); if (t) t.textContent = name === 'dark' ? 'Light theme' : 'Dark theme';
});
document.addEventListener('site-theme', paint);
$('#set-scale').addEventListener('pk-value-change', e => writeSetting('pk-gallery-scale', e.detail.value));
$('#set-width').addEventListener('pk-value-change', e => writeSetting('pk-gallery-width', e.detail.value));
mountLogSettings($('#set-logging'), {});
