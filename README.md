# Asticore Engage — Grace & Gatsby

The public **Grace & Gatsby** website and the **Asticore Engage** content portal that runs it, deployed as a single application.

Editors sign in at `/admin` to build pages, run the shop, publish events and posts, and configure the site. Visitors get the storefront rendered from the same content.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/asticore/gracengatsby)

Cloudflare provisions the Worker, D1 database and R2 bucket from `wrangler.jsonc` and, per the `cloudflare.bindings` block in `package.json`, prompts for the secrets/vars listed in [Environment variables](#environment-variables) below. `wrangler.jsonc` currently carries this project's own live database ID and bucket name - a new deploy on a different Cloudflare account provisions its own D1/R2 resources with new IDs, per Cloudflare's standard Deploy-to-Workers behavior, but that path has not been exercised end-to-end from this repo, so treat it as unverified until someone runs it. The button's build runs `pnpm run deploy` (OpenNext build + deploy). It needs no manual follow-up: the first request to the new site detects the empty database and runs the full schema migration and starter-content seed by itself (`src/migrations/ensureInitialised.ts`), then `/admin` lets you create the first admin user. Use `pnpm run deploy:full` for later upgrades to an existing database.

---

## Stack

| Layer      | What it is |
| ---------- | ---------- |
| Runtime    | Next.js 15 (App Router, React 19) on Cloudflare Workers via OpenNext |
| Database   | Cloudflare D1 (SQLite), bound as `D1` |
| Media      | Cloudflare R2, bound as `R2` |
| Payments   | Stripe (only needed when the Shop feature is on) |
| Language   | TypeScript throughout |

Two route groups live under `src/app/`:

- `(frontend)` — the public site: home, pages, blog, shop, events, FAQ, cart, checkout.
- `(engage)` — the portal: the admin UI at `/admin`, the content API under `/api`, and two internal deploy endpoints.

Neither group name appears in a URL — parentheses make them organisational only.

---

## Layout

```
src/
  engage-types.ts     content types for collections and globals (committed, edited by hand)
  lib/engine.ts       getEngine(): the initialised CMS client used server-side
  collections/        Pages, Posts, Faqs, Events, EventRSVPs, PageTemplates,
                      FieldGroups, Media, Users
  globals/            Header, Footer, SiteSettings, Integrations + one settings
                      global per feature (SEO, Speed, Media, Email, Backups, …)
  blocks/             page-builder block definitions (Hero, Section, Loop, …)
  components/blocks/  the React renderers for those blocks
  features/           the feature registry and the Site Settings toggle field
  fields/             reusable field sets — SEO, slug, custom fields, visual editor
  views/              the custom Visual Editor admin view
  migrations/         migration files + the generated schema-diff data they apply
  seed/               idempotent starter content (Home page + page templates)
```

---

## Running it locally

Requires Node ≥ 24.15 and pnpm.

```bash
cp .env.example .env      # fill in ENGAGE_SECRET at minimum
pnpm install
pnpm dev
```

- Site: <http://localhost:3000>
- Portal: <http://localhost:3000/admin>

Wrangler creates local emulated D1 and R2 bindings automatically — no connection string, and nothing touches production. On first run, create an admin user through the portal.

`pnpm devsafe` does the same after clearing `.next` and `.open-next`, which is the fix for most stale-build weirdness.

### Environment variables

| Variable | Required | Notes |
| -------- | -------- | ----- |
| `ENGAGE_SECRET` | yes | Signs sessions and encrypts secret settings fields. Generate with `openssl rand -base64 32`. This is the only secret the Cloudflare deploy button asks for. |
| `SITE_URL` | for prod | Used by `sitemap.xml`, `robots.txt` and canonical/OG URLs. |
| `STRIPE_*` | shop only | Leave blank to deploy with the Shop feature off. |
| `INTERNAL_ROUTE_KEY` | recommended | Guards the four internal maintenance routes (`/api/internal-migrate`, `/api/internal-seed`, `/api/internal-backup-run`, `/api/internal-backup-restore`). Not a hard security boundary — none of those routes can drop or modify data — but worth setting so a stray request can't run up unbounded D1 work. Falls back to a retired default if unset, so an install that hasn't set it yet still works. Generate with `openssl rand -hex 32`. |
| `ENGAGE_LOG_LEVEL` | no | `debug` \| `info` \| `warn` \| `error`. Defaults to `info` in production. |

### Useful scripts

| Command | Does |
| ------- | ---- |
| `pnpm dev` | Local dev server |
| `pnpm build` | `next build` |
| `pnpm generate:types` | Regenerates `cloudflare-env.d.ts` (Worker binding types) |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest integration tests + Playwright e2e |
| `pnpm deploy` | OpenNext build + deploy to Cloudflare (what the deploy button runs) |
| `pnpm deploy:full` | Owner flow: hand-built SQL, deploy, then `/api/internal-migrate` and `/api/internal-seed` against `SITE_URL` |
| `pnpm db:local` | Prepare and migrate a local standalone database |
| `pnpm preview` | Builds and serves the real Worker bundle locally |

`src/engage-types.ts` holds the content types (collections and globals) and is committed. Nothing regenerates it any more, so update it by hand when you add or change a collection field.

---

## Deploying

```bash
pnpm run deploy
```

That runs four steps in order, and the order matters:

1. **`deploy:database`** — applies migrations, then pushes four hand-built SQL files to real D1 with `wrangler d1 execute --remote`, then `PRAGMA optimize`. This step exists because the CLI's `migrate` cannot reach production D1 from CI (see below).
2. **`deploy:app`** — `opennextjs-cloudflare build` then `deploy`. Builds the Worker bundle and ships it.
3. **`deploy:migrate`** — `POST /api/internal-migrate` against the live deployment. This is what actually lands schema changes on production D1.
4. **`deploy:seed`** — `POST /api/internal-seed`. Creates the starter Home page and page templates if they are missing.

Steps 3 and 4 are `curl -sf ... || echo` — a failure is reported but does not fail the deploy, because both endpoints are idempotent and safe to retry by hand.

Both endpoints are guarded by an `x-seed-key` header, checked against `INTERNAL_ROUTE_KEY` (falling back to a retired default if that's unset). That is **not** a security boundary — neither endpoint can drop or modify data, so the header only keeps crawlers and stray requests out.

---

## How migrations work here

This is the least obvious part of the project. Read this before writing one.

### Why the normal path doesn't work

The CLI's `migrate` command can only ever reach a **local emulated D1** in this Cloudflare Workers Build environment, never the real database. The D1 binding in `wrangler.jsonc` is deliberately **not** marked `"remote": true`: setting it breaks `next build`, because OpenNext's own context fallback (used while Next collects page data for API routes at build time) opens a remote preview session that CI cannot create.

So production schema changes reach D1 by two other routes: plain `wrangler d1 execute --remote` for one-off fixes, and `/api/internal-migrate` for everything additive.

### Why `/api/internal-migrate` exists

It applies additive schema changes straight against the live D1 binding **from inside the deployed Worker**. That is the one path guaranteed to hit production. It applies the same schema sets the migrations use — `src/migrations/schema/builderSchema.ts` and `settingsSchema.ts` — through the shared `applySchemaAdditions` helper, so the two can never drift.

Every statement is idempotent by construction:

- tables and indexes use `CREATE ... IF NOT EXISTS`
- column adds are guarded by a `PRAGMA table_info` check first, because SQLite has no `ALTER TABLE ADD COLUMN IF NOT EXISTS`

That is what makes it safe to call on every single deploy.

### The diff-and-verify procedure

The CLI's `migrate:create` emits a **full-schema dump, not a diff**, because this project keeps no drizzle snapshot of its current state. Running that dump against a database that already has the tables just fails. So what actually gets committed is the computed *difference* between the schema the config wants and the schema that already exists.

To regenerate a schema set after changing the config:

1. Write the new tables/columns as an idempotent schema set under `src/migrations/schema/` (see the worked example above).
2. Build a **TARGET** database: apply that dump to an empty SQLite file, first seeding any table the dump omits (it skips tables it considers unchanged) from the current database's own DDL.
3. Diff TARGET against the current database — `.wrangler`'s local D1 tracks the same migration state as production. Collect tables, columns and indexes present only in TARGET.
4. Emit those three lists, rewriting every `CREATE` as `IF NOT EXISTS`.
5. **Verify**: apply the result twice to a copy of the current database. The second pass must add nothing, and the final schema must match TARGET exactly.

The canonical worked example is `src/migrations/20260822_234701_builder_sections_loops_custom_fields.ts` — start there.

### Rules of thumb

- **Additive only.** Down migrations for schema sets are deliberate no-ops; rolling one back would drop live content.
- The generated `.json` snapshots next to migrations are gitignored — each is a ~500KB full-schema dump this project cannot rely on anyway.
- If you ever apply a schema change to production D1 by hand (e.g. the Cloudflare dashboard's D1 console), **also insert a matching row into the `eg_migrations` table** so the engine does not try to reapply it on the next deploy. That table, along with the other `eg_*` engine tables, is internal bookkeeping — do not rename them.

---

## Feature toggles

Optional functionality is switched on and off from **Site Settings → Features** in the portal. `src/features/registry.ts` is the single source of truth.

Each entry declares its label, description, default state, the collections and globals it owns, the database tables it owns, and an `implemented` flag. Everything else reads from the registry instead of hard-coding feature names:

- **Site Settings** renders one checkbox per entry (`featureToggleField.ts`), three per row.
- **The portal sidebar** hides a feature's collections and globals while it is off (`isCollectionEnabled` / `isGlobalEnabled`).
- **Public routes** call `getFeatureFlags()` and `notFound()` when their feature is off — so `/blog` 404s with Blog disabled.
- **Database Cleanup** is designed to use `tables` to purge a disabled feature's data on request. The registry side is in place; the tool itself is not built yet.

Adding a feature means adding one registry entry and nothing else structural.

Two details worth knowing:

- **`implemented: false`** means the settings screen exists and saves, but the behaviour behind it is still being built. The toggle's own description says so rather than silently doing nothing. Currently shipped end-to-end: Shop, Events, Blog, FAQs. Everything else (Forms, SEO & Analytics, Speed, Media, Email, Backups, Members, A/B testing, Security, Multilingual, Customer accounts, Courses) is settings-only for now.
- **`tables` lists BASE table names only.** The cleanup tool expands each into its real family at runtime — the SQLite adapter also generates `<table>_rels`, `_<table>_v`, `<table>_locales` and one `<table>_blocks_<block>` child per block type. That expansion changes as blocks are added, so it is never written out by hand.

Turning a feature off **hides**; it never deletes.

---

## Site templates

Site templates (`site-templates` collection, code in `src/features/siteTemplates`) let a header, footer or whole page layout be built from the same sections as pages. A template has a **kind** (`header`, `footer`, `single-post`, `single-product`, `single-event`, `archive-blog`, `archive-shop`, `not-found`), an **enabled** flag, a **priority** and optional **conditions**. For each request the resolver takes the enabled templates of the right kind whose conditions match and picks the highest priority (ties go to the lowest id). Conditions are JSON: an outer list of groups (OR), each an inner list of rules (AND), e.g. `[[{"param":"postCategory","operator":"equals","value":"News"}]]`. Params: `postCategory`, `postTag`, `productCategory`, `productType`, `eventType`, `path` (exact request path, e.g. `/shop`) and `templateKind`; operators are `equals` / `notEquals`; a post or product with several categories matches if any one equals the value. Empty conditions match everything of that kind. Conditions fail closed: a template whose conditions contain any invalid rule, unknown param or operator, or more than 10 groups / 10 rules / 200-character values never matches (it is skipped, not widened). Templates with no sections are ignored when picking a winner.

Inside a template, the **Template content** element (Layout group) marks where the page's own content appears. A template without one shows its sections first and the content straight after them. With no matching template, or on any error while resolving one, the page renders exactly as it did before templates existed. A matching header or footer template replaces the built-in header or footer (wrapped in a `<header>` / `<footer>` landmark). For the 404 page, the page picked in Site pages still wins, then a `not-found` template, then the built-in message.

Limits for now: there is no search results route yet, so there is no `search` kind (it returns with a search page). Header and footer conditions can only use `path` (they are drawn before the page is known); the path is read from the `next-url` request header (the `x-pathname` header set by middleware is a response header and is not visible to the layout), so test path-scoped header/footer templates on the live site. A Template content element is ignored in headers and footers. Per request the layout costs one lightweight index query plus at most two template loads (the winning header and footer); the edge cache of public pages applies as usual, and saving a template revalidates the layout.

---

## Template repositories

Template repositories (code in `src/features/templateRepos`) let an agency keep page and section templates for the visual editor in GitHub. An admin turns them on under Settings > General > Integrations > **Template repositories**, adds each repository (name, GitHub user or organisation, repository, branch, optional folder) and, for a private repository, one read-only access token ("Fine-grained read-only token. Leave blank for public repos."). The token is stored encrypted like the other keys and is never sent to a browser.

Repository layout (inside the optional folder):

```
manifest.json                    { "schemaVersion": 1, "name": "...", "categories": [{ "key", "label" }],
                                   "templates": [{ "slug", "title", "kind": "page"|"section", "category", "tags"?,
                                                   "preview": "templates/<slug>/preview.png",
                                                   "file": "templates/<slug>/template.json" }] }
templates/<slug>/template.json   { "format": "engage-template", "schemaVersion": 1, "kind", "tree": [...], "assets"?: [], "requires"?: {} }
templates/<slug>/preview.png     png, jpeg or webp, up to 2 MB
```

API (administrators and editors only, same session check as the other admin routes): `GET /api/template-repos` lists templates from every enabled repository (`repoIndex`, `repoLabel`, `slug`, `title`, `kind`, `category`, `tags`, `previewUrl`) plus one plain-English error per repository that failed; `GET /api/template-repos/template?repo=<n>&slug=<slug>` returns one validated template; `GET /api/template-repos/preview?repo=<n>&slug=<slug>` streams the preview picture from this site, so the browser never talks to GitHub.

Safety: the browser never supplies a URL. Addresses are built on the server from validated owner / repository / branch / folder, and only for `raw.githubusercontent.com` (public) or `api.github.com` contents (when a token is set, which applies to every repository in the list). Redirects are refused, each request times out after 8 seconds, and results are cached in memory for 5 minutes. Limits: manifest 500 KB, template 1 MB, 500 templates, slugs `^[a-z0-9][a-z0-9-]{0,63}$`, no `..` or absolute paths, only files the manifest lists can be fetched. Templates are treated as data: items of type html, code, script, embed, iframe, style and similar (compared ignoring case, dashes and underscores), any `dangerouslySetInnerHTML` field, and any text containing a script or frame tag or a `javascript:` link are refused. This deny list is a first line of defence for now; it also refuses legitimate "code" items inside rich text.

Limits for now: one token is shared by all repositories; the editor-side picker is built separately and uses these routes.

## Connect Google

The site connects to Google with **your own** Google Cloud OAuth client, set up once. Nothing is shared with another site, and the sign-in is read-only.

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project (or choose one).
2. Under **APIs and services > Library**, switch on: Google Analytics Data API, Google Analytics Admin API, Google Search Console API, Tag Manager API and AdSense Management API.
3. Under **APIs and services > OAuth consent screen**, fill in the app name and your e-mail. Either keep the app in testing and add your own Google account as a test user, or publish it.
4. Under **Credentials**, create an **OAuth client ID** of type **Web application**.
5. Under **Authorised redirect URIs**, add the address shown on the Google connection screen: `<your site>/api/google/callback`. It must match exactly, including `https://` and no trailing slash.
6. In the portal, open **Settings > Site > Google connection**. Paste the **Client ID** and **Client secret**, save, then choose **Connect with Google**.
7. Choose the Analytics property, Search Console site, Tag Manager container and AdSense account. Choosing a property fills the GA4 measurement ID on Integrations, and choosing a container fills the GTM container ID, but only where those fields are blank.

Notes:

- The client secret and the refresh token are encrypted at rest with `ENGAGE_SECRET`, like the other stored keys. Changing `ENGAGE_SECRET` means entering the client secret again and connecting again.
- Only administrators can connect, change or disconnect Google. Disconnecting asks Google to revoke the sign-in and keeps the client ID and secret.
- The sign-in state is checked against a short-lived cookie, so a link planted by another site cannot complete a connection.
- Routes: `/api/google/connect`, `/api/google/callback`, `/api/google/disconnect`. Code: `src/features/google/`, the global in `src/globals/GoogleConnection.ts`, the screen in `src/admin/views/GoogleConnectionView.tsx`.

---

## Tracking and where tags go

Tracking has three parts, all under Settings > Tracking.

1. **Connections** (Settings > Tracking connections, or the ID fields on Integrations): Meta pixel, Google Analytics 4, Google Tag Manager and TikTok pixel. Each has an on/off switch. Meta and TikTok also have a consent category. You can type an ID, or use "Connect with Google / Facebook / TikTok" and pick from a list. Tokens are stored encrypted and never sent to the browser.
2. **Tracking events** (the Tracking events table and the **Add tags** visual editor): each event is a rule saved in the database (table `eg_tracking_events`): a CSS selector, a trigger (click, form submit, page view, scroll, time on page), an optional URL rule (language prefixes are ignored), a standard event name (Add to cart, Purchase, Lead and so on) and an optional value source (fixed amount, cart total, product price, order total, quantity, element text or attribute, or a data layer variable). Create them in the table, or use **Add tags** to open the live site, click an element and pick an event. The editor can also suggest tags for the page you are on and lists every tag already on it.
3. **Runtime**: public pages load a small script only when at least one enabled event exists. When a visitor triggers an event and has given the matching cookie consent, the script sends it straight from the visitor's browser to every connected destination: `fbq` for Meta, `gtag` for GA4, `ttq` for TikTok, and `dataLayer.push` for Tag Manager. A standard page view goes only to the data layer so it is not counted twice with the base tags. Nothing fires before consent, for signed-in admins, in the editor's Navigate mode, or under the admin and preview paths. Test mode in the editor shows a toast instead of sending.

So the tags end up in each platform's own tools (Meta Events Manager, GA4 reports and DebugView, TikTok Events Manager, or your Tag Manager container). The site itself does not keep a log of each time an event fires, and it does not send events from the server (Meta Conversions API and the GA4 Measurement Protocol are not built).

## Portal theming

`src/app/(engage)/custom.css` carries the whole portal theme. Read its header comment before touching it — the colour system is easy to get wrong.

The short version: `--color-base-0 … --color-base-1000` is **one** ramp running light → dark, not one ramp per theme. The base stylesheet maps it onto `--theme-elevation-*` and inverts that mapping for dark mode. Supplying a second, already-inverted ramp inverts twice and produces light text on light surfaces. Define the ramp once, define all 21 steps, and let the inversion happen.

Override documented CSS custom properties, not class names, and declare overrides in a later cascade layer so nothing needs `!important`.

Brand marks live in `src/components/branding/`, and the browser-tab identity (title, description, favicon) is set explicitly in the admin `RootLayout` metadata.

---

## Known constraints

- **Paid Workers plan required** — the bundle exceeds the 3 MB free-tier [size limit](https://developers.cloudflare.com/workers/platform/limits/#worker-size).
- **GraphQL** is not guaranteed when deployed, pending an [upstream workerd fix](https://github.com/cloudflare/workerd/issues/5175). The REST API is unaffected.
- **Logging is opt-in** in the Cloudflare panel because it draws on your quota. The custom console logger in `src/localapi/logger.ts` exists because the default logger uses `pino-pretty`, which needs Node APIs Workers does not have and fails with `fs.write is not implemented`. It is production-only; dev keeps the prettier default.
- **No image processing.** `crop` and `focalPoint` are disabled on the Media collection because `sharp` is not available on Workers. Resizing/optimisation is expected to come from Cloudflare's image pipeline instead.
- **"Failed to publish diagnostic channel message"** entries in observability logs come from the `undici` HTTP client and are noise rather than a fault.
