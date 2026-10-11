---
type: added
issue: 1080
---
`node core/tools/bundle-page.mjs --html page.html --out dist-page` bundles the shared core and exactly the elements a page uses into one minified module and one stylesheet (two requests instead of 20 to 27; about 20 to 40 percent fewer gzip bytes). The element list comes from `--elements` or from the `pk-*` tags in an HTML file; `--app` adds the app framework. It is a build tool that needs esbuild, so it runs from a checkout or next to a project that installs esbuild.
