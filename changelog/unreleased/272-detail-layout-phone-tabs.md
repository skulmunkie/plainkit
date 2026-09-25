---
type: added
issue: 272
---
`pk-detail-layout` groups a record page's cards into phone tabs: an element inside it (main column or sidebar, at any depth) with `data-pk-section="pricing"` (and optionally `data-pk-section-label`) joins that section; once the layout has collapsed to one column and names two or more sections it shows a `pk-tabs` strip and only the selected section, plus a "Next: section" button, and reveals a section whose required control fails form validation. The new `section` prop (`pk-section-change` event; `Section` and `OnSectionChange` on `PkDetailLayout`) and `nextLabel` (`NextLabel`) drive it; a wide layout shows everything.
