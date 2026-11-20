# Markdown wide-table relations

| viewport | table | fills the column | scrolls | stays within the column |
| --- | --- | --- | --- | --- |
| 1680px | fill | true | false | true |
| 1680px | wide | false | true | true |
| 1680px | long-cell | true | false | true |
| 1100px | fill | true | false | true |
| 1100px | wide | false | true | true |
| 1100px | long-cell | true | false | true |
| 640px | fill | true | false | true |
| 640px | wide | false | true | true |
| 640px | long-cell | true | false | true |

Wrap-first engagement (taller at the narrowest stop than at the widest):

- fill: true
- long-cell: true
