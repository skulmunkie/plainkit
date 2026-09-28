// The shared shell every page-type element composes (#423): one place that draws a page's state region (loading, empty, error, forbidden or
// ready) AND makes sure the pk-* elements that state uses are loaded, so a page type says what state it is in and nothing more.
// Title bar and tabs follow in later steps (see #423); state is the piece all page types already repeat.
//
//   import { showState } from '../../js/page-shell.js';
//   showState(box, 'loading', { label: 'Loading orders' });
//   showState(box, 'error', { error: err, retry: () => this.fetch() });   // description defaults to the error's message
//   showState(box, 'ready');
import { renderState } from './page-states.js';
import { loadElements } from './loader.js';

/** renderState(box, state, opts) then loadElements(box). `opts.error` (a caught value) becomes the description when none is given. */
export function showState(box, state, opts = {}) {
    const { error, ...rest } = opts;
    if (error !== undefined && rest.description === undefined) rest.description = error?.message ?? String(error);
    renderState(box, state, rest);
    if (state !== 'ready') loadElements(box);
}
