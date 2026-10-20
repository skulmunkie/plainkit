---
type: fixed
issue: 1653
---
The PkPageTesting helpers run the record page save the way a click on Save does: SaveAsync checks required fields (returning "Label is required."), runs BeforeSave (false stops the save) and then Save and OnSave, and SetField re-evaluates When, Disabled and the labels of dependent fields.
