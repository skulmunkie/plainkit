// The settings page: theme, gallery text size and sample width. Values live in localStorage through the shared settings helper.
import { mountShell, readSetting, writeSetting } from '../shell.js';
import { setTheme, currentTheme } from '../../js/theme.js';

mountShell({ page: 'settings', title: null });
const root = document.documentElement;
const $ = s => document.querySelector(s);
const paint = () => document.querySelectorAll('[data-theme-set]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeSet === currentTheme(root))));

paint();
$('#set-scale').value = readSetting('pk-gallery-scale') ?? '1';
$('#set-width').value = readSetting('pk-gallery-width') === 'phone' ? 'phone' : 'desktop';
document.addEventListener('click', e => {
    const b = e.target.closest('[data-theme-set]');
    if (!b) return;
    setTheme(root, b.dataset.themeSet); writeSetting('pk-site-theme', b.dataset.themeSet); paint();
    document.dispatchEvent(new CustomEvent('site-theme', { detail: b.dataset.themeSet }));
    const t = $('#site-theme'); if (t) t.textContent = b.dataset.themeSet === 'dark' ? 'Light theme' : 'Dark theme';
});
$('#set-scale').addEventListener('change', e => writeSetting('pk-gallery-scale', e.target.value));
$('#set-width').addEventListener('change', e => writeSetting('pk-gallery-width', e.target.value));
