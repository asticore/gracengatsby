# Tables and charts

A saved table or chart lives under Content > Tables and charts (collection `data-views`, table `eg_data_views`).
Code is in `src/features/dataViews/`.

## What it does

- Kinds: table, bar, line, area, pie, doughnut, scatter.
- Sources: site content and Extra fields (pages, posts, products, events, FAQs), a typed-in grid, or an imported CSV/Excel file.
- Rendering: tables are server rendered accessible HTML (caption, `th scope`). Charts are server rendered inline SVG with a hidden data table for screen readers. A small script (`enhance.ts`) adds sorting, search, paging and tooltips; everything works without it.
- Placing one: the Table or chart element in the visual editor (with a live preview on the canvas), the shortcode `[data-view id="3"]` or `[data-view slug="sales"]`, or the merge tag `{{data-view:sales}}`. A shortcode or tag must be alone in a paragraph of rich text.
- Embed card in the editor: share link `/embed/data/<id-or-slug>` (add `?theme=dark`), an iframe snippet that resizes itself by postMessage, and data links `/api/data-view/<id-or-slug>.csv` and `.json`.

## Rules the code enforces

- Only published documents are used. Members-only and password protected documents are skipped.
- Built-in fields come from an explicit allow-list per collection (`catalogue.ts`). Custom fields are offered only if they hold a plain single value and their name does not start with `_` (that marks a private field). Values hidden by a field's conditions are dropped per document. A stored view that names anything else is ignored at read time, not only at save time.
- Filters are a field key, one of eleven fixed operators and a text value, applied in memory. Nothing is turned into SQL.
- The share page and data links work for the public only when the view is marked public. Otherwise they answer 404 to everyone except a signed-in person with the Tables and charts read permission.
- Framing by other sites is allowed on `/embed/data/*` only (`features/security/headers.ts`).

## Limits

| Limit | Value |
| --- | --- |
| Documents read from a collection before filtering | 1000 |
| Rows shown or exported | 500 |
| Columns | 24 |
| Filter rules | 8 |
| Typed-in grid | 500 rows by 24 columns, 1000 characters per cell |
| Stored CSV text | 1,000,000 characters |
| Chart categories / series | 60 / 8 (pie and doughnut: 12 slices, the rest grouped as Other) |
| Cache | 60 seconds per server instance; saving any source document, a view or an Extra fields set clears it on that instance |

Not supported: merged cells, drafts or scheduled content in a view, relationship/image/file/repeater custom fields as columns, custom fields in groups restricted by editor role, live (auto refreshing) imports, and charts on dates as a true time scale (dates are labels).
