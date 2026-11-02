// master-detail-static-frame.html is server-rendered markup; "?nojs" leaves every pk-* un-upgraded (the no-JavaScript view), "?record" is the server writing record-id on the record's own URL.
import { loadElements } from '../../js/loader.js';

if (location.search.includes('record')) document.querySelector('pk-master-detail-page').setAttribute('record-id', '2');
if (!location.search.includes('nojs')) loadElements(document);
