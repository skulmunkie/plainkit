---
type: fixed
issue: 135
---
The gallery, scorecard and theme editor pages no longer jump on load: the site shell now reserves the top bar's height in the page's own HTML/CSS instead of growing into it after `pk-navbar` upgrades, and the theme editor clears its "loading" notice before mounting its content instead of after.
