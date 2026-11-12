---
type: added
issue: 1938
---
pk-table has a media column: a column with type "media" draws the row value as an image in a box reserved before it loads (floor height from size sm, md or lg, width from ratio, fit cover or contain, empty alt unless alt names a row key), filling the row height and cropping when a row is taller; the code loads only when a table uses one.
