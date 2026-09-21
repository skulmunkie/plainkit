---
type: changed
issue: 145
---
The `plainkit` npm package declares `"type": "module"` in `core/package.json` (a package-format change: every `.js` file it ships was already an ES module, so consumers see no difference, but node no longer prints `MODULE_TYPELESS_PACKAGE_JSON` and stops parsing each file twice). The API surface is unchanged.
