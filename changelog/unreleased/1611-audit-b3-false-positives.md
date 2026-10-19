---
type: fixed
issue: 1611
---
The consumer audit rule B3 no longer reports valid markup as an unknown parameter: `<Param>Changed` callbacks, parameter names in any letter case, and pass-through HTML attributes such as `class`, `title`, `slot`, `spellcheck` and `inputmode` are accepted, while genuinely unknown names such as `Label` are still flagged.
