// Loads the elements of quote-frame.html, the page the pk-quote un-upgraded case opens in an iframe (#1838).
import { loadElements } from '../../js/loader.js';
// ?hold=pk-quote leaves the tag undefined until window.release(): the state of a page with no JavaScript (or before it has loaded).
const hold = new URLSearchParams(location.search).get('hold')?.split(',').filter(Boolean) ?? [], kept = [], define = customElements.define.bind(customElements);
if (hold.length) customElements.define = (name, ctor, options) => (hold.includes(name) ? kept.push([name, ctor, options]) : define(name, ctor, options));
window.release = () => { customElements.define = define; for (const k of kept.splice(0)) define(...k); };
loadElements(document);
