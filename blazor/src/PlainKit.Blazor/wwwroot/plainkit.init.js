// Starts the pk-* elements for the document. <PkScripts /> loads this as a module script so the root document needs no inline script (a strict CSP blocks one).
import { initPlainkit } from './plainkit/js/init.js';

initPlainkit();
