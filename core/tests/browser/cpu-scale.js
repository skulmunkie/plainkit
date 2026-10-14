// How much slower than an idle machine this one is right now (#1247). Browser cases that budget real milliseconds (a chunk loads in 300 ms, 10,000 rows paint
// in 100 ms) lose the race on a loaded runner even when the code is fine. The budgets stay what they are on an idle machine; the case multiplies them by this
// factor, measured with a fixed pure-JS workload run right next to the measurement. 1 on an idle machine (never below 1), capped at 4 so a case still fails
// when the code is several times too slow.
const REF_MS = 21; // this spin in headless Chrome on an idle development machine (about 21 ms; the loop is deliberately float-heavy, so it tracks the CPU the cases are starved of)
const spin = () => { const t0 = performance.now(); let x = 0; for (let i = 0; i < 2e6; i++) x += Math.sqrt(i) % 3; spin.sink = x; return performance.now() - t0; };

export function cpuScale() {
    spin();
    const ms = Math.min(spin(), spin(), spin());
    return Math.min(4, Math.max(1, ms / REF_MS));
}
export { spin };
