---
type: fixed
issue: 652
---
The pk-combobox list is no longer cut off inside a card, form or table cell with hidden overflow: it is placed over the page from its box. When a host replaces the options while the list is open (an async search), the highlight and aria-activedescendant move to a live option, and filtering="off" shows the empty message for an empty answer.
