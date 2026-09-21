---
type: added
issue: 46
---
An element meta file can declare `writes` (`{ target, attributes, why }`): the attributes and props the element sets on nodes it does not own, such as the tabs on their tab panels or the trigger of a popover. It is filled for the 20 elements that do this, shown in the skills element reference and the gallery element page, and a test fails when an element writes to a foreign node without declaring it.
