// The SDK scorecard as a module of the site app (#355, step 6a). The data and the section list live in site/scorecard/scorecard.js (startScorecard); this file is the route.
// Address: #/scorecard (?concurrency=2 renders fewer frames at once on a slow machine). `mounted` is the running card ({ run, results, report, ready }) so a headless runner
// (scripts/scorecard-sweep.mjs) can drive the same run the button does.
import { defineModule } from '../../js/app.js';
import { startScorecard } from '../scorecard/scorecard.js';

export let mounted = null;

const mount = query => (host, ctx) => {
    const ready = mounted = startScorecard(host, Number(query.concurrency) || undefined, ctx.signal).catch(err => { ctx.log.error('the scorecard could not start', err); return null; });
    return () => { ready.then(card => card?.destroy?.()); mounted = null; };
};

export default defineModule({
    id: 'scorecard', title: 'Scorecard', icon: 'chart', widgets: { budgets: { load: async () => ({ value: String(Object.keys((await import('../scorecard/scoring.data.js')).BUDGETS).length), subtext: 'size and speed budgets, each a one-way ratchet' }) } },
    routes: [{ path: '*', page: 'custom', config: ({ query }) => ({ mount: mount(query ?? {}) }) }],
});
