---
type: fixed
issue: 357
---
`ctx.navigate` in an app module keeps the query of the path it is given (`ctx.navigate('/7?tab=notes')` goes to `#/orders/7?tab=notes`); it dropped the query before, so a doc page's heading links lost their `?anchor=` address. In the site app, an unknown guide now logs a warning as well as showing the not-found page.
