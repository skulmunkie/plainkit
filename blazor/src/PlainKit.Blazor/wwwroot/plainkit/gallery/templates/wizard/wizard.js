import { mountChrome } from '../chrome.js';
mountChrome({ title: "Wizard", page: "wizard", crumbs: [["Section","page.html"]], actions: "", fill: false });

// The stepper, the card title and the Back and Next buttons stay in step: the elements do the rest.
const titles = ['Step one', 'Step two', 'Review'];
const stepper = document.querySelector('pk-stepper');
const card = document.getElementById('step-card');
const back = document.getElementById('back');
const next = document.getElementById('next');
function update(n) {
    card.heading = titles[n];
    back.disabled = n === 0;
    next.disabled = n === titles.length - 1;
}
function show(n) { stepper.current = n; update(n); }
back.addEventListener('click', () => show(stepper.current - 1));
next.addEventListener('click', () => show(stepper.current + 1));
// A click on a reached step: the event fires before the stepper moves, so it carries the target index.
stepper.addEventListener('pk-step-change', e => update(e.detail.index));
show(stepper.current);
