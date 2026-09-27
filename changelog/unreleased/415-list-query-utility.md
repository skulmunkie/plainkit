---
type: added
issue: 415
---
`js/list-query.js` (`queryList`): a generic filter/search/sort/paginate computation for a list page (a status tab, a search box, a sortable table and a pager, all narrowing the same rows together) - the `routed-list-detail` sample now uses it instead of hand-rolled page logic.
