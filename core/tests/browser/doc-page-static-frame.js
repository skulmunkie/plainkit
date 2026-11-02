// doc-page-static-frame.html is server-rendered markup; "?nojs" leaves every pk-* un-upgraded (the no-JavaScript view), otherwise the elements load.
import { loadElements } from '../../js/loader.js';

if (!location.search.includes('nojs')) loadElements(document);
