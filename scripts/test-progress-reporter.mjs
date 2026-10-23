// A node:test reporter for scripts/verify.mjs (#1754): one line per test file start and end ("start|end<TAB>file<TAB>file") to the destination file, so the watchdog can
// name the files still running when a run stalled. A file starts when the runner spawns its process (test:dequeue) and ends at test:complete; only those top-level events are recorded.
export default async function* progress(source) {
    for await (const e of source) {
        if ((e.type === 'test:dequeue' || e.type === 'test:complete') && e.data.file && e.data.nesting === 0) {
            yield `${e.type === 'test:dequeue' ? 'start' : 'end'}\t${e.data.file}\t${e.data.file}\n`;
        }
    }
}
