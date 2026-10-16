---
type: added
issue: 1415
---
The page types' panes can be filled with slotted content, which is how Blazor renders into them: a `pk-wizard-page` step without fields projects `slot="step-<id>"`, `pk-workspace-page` projects `nav`, default (main) and `aside`, and `pk-master-detail-page` projects `detail` (and gains `refresh()`). In Blazor, `PkWorkspacePage` gets `NavContent`, `ChildContent` and `AsideContent`, `PkMasterDetailPage` gets `DetailContent`, `Load` and `Close`, and `PkWizardPage` takes the step elements as `ChildContent`.
