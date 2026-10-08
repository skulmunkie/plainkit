// Loads the elements of table-frame.html, the page the table tap-target browser cases open in an iframe of a chosen width (media queries answer to the frame's width).
import { loadElements } from '../../js/loader.js';

const ROWS = [{ id: 'C1', name: 'Anchor', sku: 'AN-1' }, { id: 'C2', name: 'Bolt', sku: 'BO-2' }, { id: 'C3', name: 'Clamp', sku: 'CL-3' }];
document.querySelector('pk-data-table').load = async q => ({ rows: ROWS, total: ROWS.length });
loadElements(document);
