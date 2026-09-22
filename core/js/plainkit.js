// Plainkit's full entry: initPlainkit (js/init.js has it alone, with nothing else) plus the dynamic-value, theming and colour helpers, so
// one import wires all of it. A page that only calls initPlainkit() should import js/init.js instead: importing this file also fetches
// dynamic.js, theme.js and colour.js, whether or not the page uses them.
//
//   <script type="module">import { initPlainkit } from './plainkit/js/init.js'; initPlainkit();</script>

export * from './init.js';
export * from './dynamic.js';
export * from './theme.js';
export * from './colour.js';
