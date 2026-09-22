# Benchmarks

Dependency-free measurements of the SDK and of PlainKit.Blazor, run in a real (headless) Chrome or Edge you already have installed. Nothing is
installed and nothing is committed: profiles are temporary and removed, pages are served from memory, and the results are printed (add
`--json=<file>` to keep them). They are **not** part of CI and **not** part of `node scripts/verify.mjs`: wall-clock numbers are noisy, so a budget on
them would flake. What is stable (counts, bytes, retained listeners) is guarded by ordinary tests instead (see "Regression guards").

```
node scripts/bootstrap.mjs                       # once, and after any source change (the benches read core/dist)
node scripts/bench/load.mjs      [--runs=5]
node scripts/bench/runtime.mjs   [--only=upgrade|batching|leaks] [--runs=5] [--n=2000] [--tag=pk-x] [--verbose]
node scripts/bench/scale.mjs     [--only=table|log|tree|list|misc] [--runs=3]
node scripts/bench/pages.mjs     [--only=pages|sweep|css] [--runs=3]
node scripts/bench/package.mjs   [--nupkg=path]
node scripts/bench/blazor.mjs    [--only=table|list|assets] [--runs=3] [--publish=<dir>]   # build the Playground first, see below
```

Options are `--name=value` (no space). `PK_CHROME` names the browser (as for `scripts/attest-browser.mjs`); `PK_CHROME_FLAGS` adds flags. Every script takes
`--json=<file>`. Do not use the machine for anything heavy while a timing bench runs; `leaks` is the slowest (about 10 minutes for every element at 2,000 instances).

## How the numbers are made steady

- **Fixed viewport**: 1280 x 900, device scale factor 1, set through the DevTools protocol, the same for every run.
- **Warm-up**: the first run of every case is thrown away (browser start, JIT, the server's compression cache); the rest are counted.
- **Median of N runs**: the number reported is the median; `lib.mjs` also has `summary()` for min and max when you want the spread.
- **A fresh page per run** for load and table cases; the network cache is disabled unless the case is about caching.
- **Throttling is explicit**: `Emulation.setCPUThrottlingRate` (4x) and `Network.emulateNetworkConditions` (Slow 4G: 1.6 Mbit/s, 150 ms) are named in the row.
- **"Until the next frame"** means an action plus a forced style and layout pass plus two `requestAnimationFrame` turns: what the user waits for.
- Memory is read after two `HeapProfiler.collectGarbage` calls (`Runtime.getHeapUsage`, and `Memory.getDOMCounters` for DOM nodes and JS event listeners).

## What each measure means

| Script | Measure | Meaning |
| --- | --- | --- |
| `load` | requests, js files, chain depth | requests for a page with N distinct elements; the longest chain of requests where each was started by the previous (round trips before the last element can upgrade) |
| `load` | raw / sent | bytes as files, and as sent by a server that gzips (the throttled profile) |
| `load` | FCP, upgraded | first contentful paint; time until every element on the page is defined and has rendered |
| `runtime upgrade` | sync, layout, to 2nd frame | parse + constructors + first render; plus one forced style/layout; plus two frames. B/instance is retained JS heap |
| `runtime batching` | renders | `render()` calls for a storm of property or attribute sets in one tick (the reactive core promises one per element) |
| `runtime leaks` | heap KB, nodes, listeners | create and destroy N instances of every element (its first API example, also opened for those that open); the deltas after two forced GCs. **LEAK** = any listener, more than 20 nodes or more than 512 KB kept. A control element that deliberately leaks a document listener is always run first and must say LEAK: it proves the method can see one |
| `scale table` | first render, sort, filter, select-all | ms until the next frame with N rows; "rows in DOM" says whether it is windowed |
| `scale log` | per-append cost | 10,000 appends in one tick, one per tick and one per frame, capped and uncapped; whether the view stays at the bottom, and stays put when scrolled up |
| `scale tree/list/misc` | ms | 5,050 tree items (expand all, ArrowDown), 5,000 combobox and select options, calendar month switches, 5,000-point charts, 500 images |
| `pages` | load, FCP, LCP, CLS, blocking, heap | the gallery, scorecard, theme editor and every template; CLS is observed from document start over load plus 3 s |
| `pages sweep` | heap, DOM nodes, listeners per round | three rounds of the scorecard size sweep; they must not grow |
| `pages css` | adopted sheets, theme switch | 5,000 elements: is each class's stylesheet shared, and what switching the theme costs |
| `package` | sizes | the nupkg and the static web assets, raw / gzip / brotli, runtime files against tooling files |
| `blazor table` | bytes over the circuit | WebSocket frame bytes the server sends to draw a `PkTable<T>` of N rows, a no-change re-render, and what "select all" sends back |
| `blazor list` | Load calls | `PkDataList` under fast typing (debounce) |
| `blazor assets` | headers, warm visit | cache headers and compression of what the package serves; requests of a warm visit (`--publish=<dir>` runs the published app in Production) |

## Blazor

`blazor.mjs` starts the Playground (`blazor/samples/PlainKit.Playground`, pages `/bench` and `/datalist`) on a free port and drives it. Build it first:

```
node scripts/bootstrap.mjs
dotnet build blazor/samples/PlainKit.Playground -c Release
node scripts/bench/blazor.mjs
# a published copy, in Production (compressed static assets, real cache headers):
dotnet publish blazor/samples/PlainKit.Playground -c Release -o <dir>
node scripts/bench/blazor.mjs --only=assets --publish=<dir>
```

The in-process, server-side numbers (render time and allocations of `PkTable<T>` per parameter change, memory per mounted component) are xUnit
benchmarks in `blazor/tests/PlainKit.Blazor.Tests/ScaleTests.cs`. They are skipped unless `PK_BENCH=1`, so a normal `dotnet test` never runs them:

```
PK_BENCH=1 PK_BENCH_OUT=bench.txt dotnet test blazor/tests/PlainKit.Blazor.Tests --configuration Release --filter "Category=Benchmark"
```

## Regression guards (in the normal test run)

Counts and bytes, not milliseconds: `ScaleTests` asserts that a page of 200 components makes one `import` and one `init` and that a re-render with the same
items leaves the `rows` attribute alone; the element unit tests assert the option build of `pk-combobox` does no per-option query and that the
image gallery's thumbnails are lazy. When a bench finds something with a stable measure, add such a test next to the fix.

## Proposed thresholds

What "fast enough" means here (a desktop-class machine; on the 4x CPU profile allow four times as much). A bench row over its line is a finding.

| Measure | Fine | Look at it |
| --- | --- | --- |
| Element upgrade + first render | under 0.25 ms each | over 0.5 ms each |
| Page with 10 distinct elements, Slow 4G, 4x CPU: upgraded | under 2.5 s (LCP "good") | over 4 s |
| Data element, first render, N rows | under 100 ms | over 300 ms: page or window the data |
| Sort / filter / select-all on a rendered table | under 100 ms | over 300 ms |
| Append to a log | under 1 ms per line | over 3 ms per line |
| Keyboard step in a tree or list | under 16 ms | over 50 ms |
| Retained after create/destroy of 2,000 instances | 0 listeners, 0 nodes, under 100 B per instance | any listener or node |
| CLS (product pages, templates) | under 0.1 | over 0.25 |
| Message the browser sends to a Blazor circuit | under 16 KB | over 30 KB (the default limit is 32 KB) |
| Interop calls for a page of any size | 1 import, 1 init | one per component |
