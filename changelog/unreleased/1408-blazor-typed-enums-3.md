---
type: breaking
issue: 1408
---
More Blazor parameters are typed enums instead of strings (third batch, form and input): `PkInput.Type` and `Format` (`InputType`, `InputFormat`), `PkOtpInput.Type`, `PkCombobox.Mode` and `Filtering`, `PkForm.Validate`, `PkRadioGroup.Variant`, `PkTabs.Activation` and `Overflow`, `PkTab.Only`, `PkTree.Selection`, `PkButtonGroup.Mode`, `PkSplitButton.MenuAlign` and `PkSortableItem.DropIndicator` (the type is the component name plus the parameter name). They are nullable and sent only when set, as before; wire values are unchanged. Replace `Type="search"` with `Type="InputType.Search"`, `Mode="select"` with `Mode="ComboboxMode.Select"` and so on. `PkTableFilters` also gains a numeric `Debounce` parameter (milliseconds).
