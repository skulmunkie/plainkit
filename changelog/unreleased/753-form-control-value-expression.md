---
type: added
issue: 753
---
The Blazor form controls (PkInput, PkTextarea, PkSelect, PkCombobox, PkCheckbox, PkSwitch, PkRadioGroup, PkRange, PkRating, PkOtpInput, PkTagInput, PkColourInput) take part in an EditForm: @bind-Value (or @bind-Checked) also supplies a ValueExpression/CheckedExpression, so a change marks the field modified in the EditContext and a field with validation messages shows the element as invalid. Generated from the mapping marker "field": true.
