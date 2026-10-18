// Loads the elements of app-frame-frame.html, the page the pk-app-frame browser cases open in an iframe of a chosen width.
import { loadElements } from '../../js/loader.js';
// ?hold=pk-app-shell leaves that tag undefined until window.release(): in a real app the frame's own element arrives, then the shell inside it a moment later (#1533).
const hold = new URLSearchParams(location.search).get('hold')?.split(',').filter(Boolean) ?? [], kept = [], define = customElements.define.bind(customElements);
if (hold.length) customElements.define = (name, ctor, options) => (hold.includes(name) ? kept.push([name, ctor, options]) : define(name, ctor, options));
window.release = () => { customElements.define = define; for (const k of kept.splice(0)) define(...k); };
loadElements(document);
