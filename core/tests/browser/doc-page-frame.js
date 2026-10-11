// Loads the elements of doc-page-frame.html, the page the doc-page spacing browser case opens in an iframe of a chosen width (media queries answer to the frame's width).
import { loadElements } from '../../js/loader.js';

const page = document.querySelector('pk-doc-page');
const home = { title: 'All guides', summary: 'Pick one.', cards: location.search.includes('cards') };
page.config = { level: 2, breadcrumb: true, home, id: location.search.includes('cards') ? null : 'a', items: [{ id: 'a', title: 'Guide A', summary: 'About A' }, { id: 'b', title: 'Guide B', summary: 'About B' }] };
page.loadItem = async id => ({ title: `Guide ${id.toUpperCase()}`, summary: 'A summary', html: '<h2 id="one">One</h2><p>text</p><h2 id="two">Two</h2><p>more</p>' });
page.href = id => `#/${id ?? ''}`;
loadElements(document);