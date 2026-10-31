# Template libraries: author guide

A template library is a public GitHub folder with ready-made sections and pages. Once an administrator adds
the folder's address under **Settings > Template libraries**, its items appear:

- in the **Templates hub**, on the **Library** tab, where an item can be turned into a new draft page
  ("Create page from this template");
- in the **visual editor**, in the templates panel, where an item is added to the page being edited.

Pictures used by an item are saved to the **Media** gallery the first time the item is used. A picture that
is already there (same bytes) is reused, not saved again.

An example library you can copy is in [`docs/template-library-example`](template-library-example/). It holds
a `library.json`, two items, and the pictures they use.

## 1. Folder layout

```
library.json                  the manifest (required)
items/<name>.json             one file per item, named in library.json
previews/<name>.png           a picture shown in the list (PNG, JPEG or WebP)
images/<name>.png             pictures the items use (optional)
```

The folder can be the root of a repository or any folder inside one (for example `site/library`).

## 2. Adding a library

Ask an administrator to open **Settings > Template libraries** and paste the address. Accepted forms:

| Address | Meaning |
| --- | --- |
| `https://github.com/owner/repo` | the repository root, branch `main` |
| `https://github.com/owner/repo/tree/branch` | a branch |
| `https://github.com/owner/repo/tree/branch/folder/inside` | a folder on a branch |

Only `https://` addresses on `github.com` are accepted. Addresses with a user name, a port, a query or a
`#` part are refused. Private repositories are not supported yet: the repository must be public.

Each library row shows its name and item count, or the reason it could not be read. Use **Refresh** after
you change the repository (the list is cached for five minutes otherwise). Switch a library off to hide it
without removing it.

## 3. `library.json`

```json
{
  "format": "engage-library",
  "schemaVersion": 1,
  "name": "Example template library",
  "items": [
    {
      "slug": "intro-split",
      "kind": "section",
      "title": "Intro with a picture",
      "category": "Hero",
      "tags": ["hero", "picture"],
      "preview": "previews/intro-split.png",
      "file": "items/intro-split.json"
    }
  ]
}
```

| Field | Required | Rules |
| --- | --- | --- |
| `format` | yes | exactly `engage-library` |
| `schemaVersion` | yes | exactly `1` |
| `name` | yes | text, up to 120 characters |
| `items` | yes | a list, up to 500 items |
| `items[].slug` | yes | lower case letters, digits and dashes, up to 64 characters; unique in the library |
| `items[].kind` | yes | `section` (one section) or `page` (a whole page) |
| `items[].title` | yes | text, up to 120 characters |
| `items[].category` | no | text, up to 60 characters; defaults to `General` |
| `items[].tags` | no | up to 10 words, up to 40 characters each |
| `items[].preview` | yes | path inside the folder to a PNG, JPEG or WebP picture, up to 2 MB |
| `items[].file` | yes | path inside the folder to a `.json` item file, up to 1 MB |

Paths must be plain relative paths: no leading `/`, no `..`, no backslashes, no percent escapes.

Older template repositories with a `manifest.json` (a `templates` list) are still read, so existing
repositories keep working.

## 4. Item files

An item file has the format `engage-template`:

```json
{
  "format": "engage-template",
  "schemaVersion": 1,
  "kind": "section",
  "tree": [
    {
      "blockType": "section",
      "columns": [
        {
          "width": 6,
          "blocks": [
            { "blockType": "element", "elementType": "heading", "props": { "text": "Welcome", "tag": "h2", "align": "left" } },
            { "blockType": "element", "elementType": "text-editor", "props": { "align": "left", "content": "<p>Some text.</p>" } }
          ]
        },
        {
          "width": 6,
          "blocks": [
            { "blockType": "element", "elementType": "image", "props": { "image": { "id": 1, "alt": "A studio picture" } } }
          ]
        }
      ]
    }
  ],
  "assets": [{ "id": "1", "path": "images/intro-photo.png", "alt": "A studio picture" }],
  "requires": {}
}
```

- `kind` must match the `kind` in `library.json` for the same item.
- `tree` is a list of blocks as the visual editor saves them: a `section` has `columns`, and each column has
  `blocks`. Every block needs a `blockType` (or `type`). Up to 5000 blocks and 24 levels of nesting.
- A `page` item's tree is the page's sections, in order.
- Pictures: each entry in `assets` has a string `id` (a number written as text, such as `"1"`), a `path` inside
  the folder, optional `alt` text and optional `sha256` (a checksum of the file, checked when it is used).
  The block that shows the picture refers to it by the same number, as `"id": 1`. Up to 20 pictures per item,
  each up to 5 MB, PNG, JPEG or WebP.
- Forbidden: raw HTML, code and embed blocks (any block type named `html`, `rawhtml`, `customhtml`, `htmlembed`,
  `code`, `customcode`, `customscript`, `script`, `scripts`, `embed`, `iframe`, `frame`, `object`, `shortcode`,
  `php`, `style`, `headscripts` or `bodyscripts`, in any spelling with dashes, underscores or spaces), keys named
  `dangerouslySetInnerHTML`, `__proto__`, `constructor` or `prototype`, and text containing `<script`,
  `<iframe`, `javascript:` or `data:text/html`. A library that uses one is refused with the reason shown.
- The item file is read as plain data. Nothing in a library is run.

Sanity check before you publish: compare your item with `docs/template-library-example/items/`.

## 5. Images and the media gallery

When an item is used, its pictures are downloaded from the library's own GitHub folder, checked (the bytes must
really be a PNG, JPEG or WebP picture), and saved to the Media gallery through the same path as an upload.
Then the item's references are pointed at the new media items. If any picture fails its check, nothing is
saved and the reason is shown.

A picture whose bytes match one already saved (same SHA-256) is reused, provided that media item still exists.
Records are kept in the library settings, up to 2000.

## 6. Limits and caching

| What | Limit |
| --- | --- |
| `library.json` | 500 KB |
| item file | 1 MB |
| preview | 2 MB |
| pictures per item | 20 |
| picture used by an item | 5 MB (or the upload limit, if lower) |
| libraries | 20 |
| items per library | 500 |

Each GitHub request has an 8 second timeout, redirects are refused, and public reads use only
`raw.githubusercontent.com`. Successful reads are kept for five minutes; **Refresh** reads again.

## 7. Troubleshooting

| Message | What to do |
| --- | --- |
| "Only GitHub addresses (github.com) can be added" | use the `https://github.com/...` address of the repository |
| "This folder has no library.json file" | add `library.json` to the folder named in the address |
| "GitHub could not find that file" | check the owner, repository, branch and folder names, and that the repository is public |
| "is not a PNG, JPEG or WebP file" | re-export the picture; a renamed file is refused |
| "is listed as a section but the file is a page" | make `kind` in `library.json` and in the item file the same |
| "does not match its checksum" | the picture changed after the checksum was written; update `sha256` |
| "The template contains script or frame content" | remove the raw HTML, script or iframe text from the item |

## 8. Trying the example

1. Copy the folder `docs/template-library-example` from this repository into a new public repository, at the
   root or in a folder of your choice.
2. Commit and push.
3. In **Settings > Template libraries**, add `https://github.com/<you>/<repo>` (or the folder address).
4. Open **Templates > Library**, or the visual editor's templates panel, to see the two items.

The example is checked by the test suite (`tests/int/template-library-example.int.spec.ts`), so it stays valid
as the format changes.
