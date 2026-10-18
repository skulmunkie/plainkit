---
type: changed
issue: 1253
---
The npm package is about 29 KB smaller packed (119 KB unpacked): the skill element references show each element's first example, and the long templates, patterns and tool module headers, with every further example, move to `references/full/` (the Pages site, the skills zip and NuGet carry it; the package leaves it out). `custom-elements.json` and `web-types.json` drop empty defaults and `reflects: false`.
