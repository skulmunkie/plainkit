import { mountShell } from '../shell.js';
import { applyDynamic } from '../../js/dynamic.js';
mountShell({ page: 'spacing', title: 'Spacing' });
const cs = () => getComputedStyle(document.documentElement);
const scale = [0, 1, 2, 3, 4, 5, 6, 8, 12].filter(n => n).map(n => `--space-${n}`);
document.getElementById('scale').innerHTML = scale.map(n => `<div class="sp-row"><code>${n}</code><span class="muted">${cs().getPropertyValue(n)}</span><span class="sp-bar" data-dyn="width:var(${n})"></span></div>`).join('');
applyDynamic(document);
const roles = [['--gap-label-input', 'label to its input'], ['--gap-input-help', 'input to its help or error'], ['--gap-field', 'field to field'], ['--gap-control', 'control to control in a row'], ['--gap-heading', 'heading to its content'], ['--gap-card', 'card to card'], ['--gap-section', 'section to section'], ['--flow-space', 'stacked siblings in .flow / .stack'], ['--gap-min', 'the least space two controls may sit apart'], ['--pad-card', 'inside a card'], ['--pad-cell', 'inside a table cell'], ['--pad-page', 'the page gutter (narrows on a phone)']];
const paint = () => { document.getElementById('roles').innerHTML = roles.map(([n, d]) => `<tr><td><code>${n}</code></td><td>${d}</td><td><code>${cs().getPropertyValue(n).trim()}</code></td></tr>`).join(''); };
paint();
document.getElementById('root').addEventListener('click', e => {
    const b = e.target.closest('[data-density]'); if (!b) return;
    if (b.dataset.density === 'compact') document.documentElement.setAttribute('data-density', 'compact'); else document.documentElement.removeAttribute('data-density');
    document.querySelectorAll('[data-density]').forEach(x => { if (x.tagName === 'BUTTON') x.setAttribute('aria-pressed', String(x === b)); });
    paint();
});
