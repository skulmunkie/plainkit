Plainkit 0.19.0, Node v24.15.0, Vite 8.3.4, .NET SDK 10.0.400. Sizes in KB (1 KB = 1024 bytes), cold load, cache disabled. JS, CSS and other are brotli; the totals are given for gzip and brotli.

| Stack | Requests | HTML | JS | CSS | Other | Total gzip | Total brotli |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Plainkit, per element | 26 | 0.5 | 27.2 | 5.7 | 0.0 | 38.4 | 33.4 |
| Plainkit, one page bundle | 10 | 0.4 | 21.3 | 5.7 | 0.0 | 31.2 | 27.5 |
| Plainkit, mountApp | 72 | 0.1 | 78.6 | 5.7 | 0.0 | 96.9 | 84.4 |
| Lit | 3 | 0.1 | 6.3 | 0.2 | 0.0 | 7.5 | 6.7 |
| Svelte | 3 | 0.1 | 13.2 | 0.2 | 0.0 | 15.0 | 13.5 |
| Vue 3 | 3 | 0.1 | 23.2 | 0.2 | 0.0 | 26.0 | 23.6 |
| React | 3 | 0.1 | 58.0 | 0.2 | 0.0 | 67.9 | 58.3 |
| Angular | 3 | 0.3 | 35.5 | 0.2 | 0.0 | 40.1 | 36.0 |
| Shoelace | 3 | 0.1 | 35.3 | 2.7 | 0.0 | 46.1 | 38.1 |
| Blazor WebAssembly (sample app) | 88 | 0.2 | 148.9 | 6.1 | 2721.7 | 3574.7 | 2876.8 |
| Blazor Server (sample app) | 52 | 2.6 | 105.0 | 6.1 | 2.6 | 134.6 | 116.3 |
