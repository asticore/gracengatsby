# Asticore Engage — Grace & Gatsby

The public **Grace & Gatsby** website and the **Asticore Engage** content portal that runs it, deployed as a single application.

Editors sign in at `/admin` to build pages, run the shop, publish events and posts, and configure the site. Visitors get the storefront rendered from the same content.

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
  engage.config.ts    single source of truth: collections, globals, plugins, admin UI
  engage-types.ts     GENERATED from the config — never edit, never committed
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
cp .env.example .env      # fill in PAYLOAD_SECRET at minimum
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
| `PAYLOAD_SECRET` | yes | Signs sessions and encrypts secret settings fields. **The name is fixed by the underlying CMS engine and cannot be renamed.** Generate with `openssl rand -base64 32`. |
| `SITE_URL` | for prod | Used by `sitemap.xml`, `robots.txt` and canonical/OG URLs. |
| `STRIPE_*` | shop only | Leave blank to deploy with the Shop feature off. |
| `ENGAGE_LOG_LEVEL` | no | `debug` \| `info` \| `warn` \| `error`. Defaults to `info` in production. |

### Useful scripts

| Command | Does |
| ------- | ---- |
| `pnpm dev` | Local dev server |
| `pnpm build` | Import map → types → `next build` |
| `pnpm generate:types` | Regenerates `cloudflare-env.d.ts` and `src/engage-types.ts` |
| `pnpm generate:importmap` | Regenerates the admin component import map |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest integration tests + Playwright e2e |
| `pnpm cms <cmd>` | Passthrough to the CMS CLI (`migrate`, `migrate:create`, …) |
| `pnpm preview` | Builds and serves the real Worker bundle locally |

`src/engage-types.ts` is generated on every build and is **not** committed — the config is the single source of truth. If your editor complains about missing types after pulling, run `pnpm generate:types`.

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

Both endpoints are guarded by an `x-seed-key` header. That is **not** a security boundary — neither endpoint can drop or modify data, so the header only keeps crawlers and stray requests out.

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

1. `pnpm cms migrate:create <name>` — produces the full-schema dump.
2. Build a **TARGET** database: apply that dump to an empty SQLite file, first seeding any table the dump omits (it skips tables it considers unchanged) from the current database's own DDL.
3. Diff TARGET against the current database — `.wrangler`'s local D1 tracks the same migration state as production. Collect tables, columns and indexes present only in TARGET.
4. Emit those three lists, rewriting every `CREATE` as `IF NOT EXISTS`.
5. **Verify**: apply the result twice to a copy of the current database. The second pass must add nothing, and the final schema must match TARGET exactly.

The canonical worked example is `src/migrations/20260822_234701_builder_sections_loops_custom_fields.ts` — start there.

### Rules of thumb

- **Additive only.** Down migrations for schema sets are deliberate no-ops; rolling one back would drop live content.
- The generated `.json` snapshots next to migrations are gitignored — each is a ~500KB full-schema dump this project cannot rely on anyway.
- If you ever apply a schema change to production D1 by hand (e.g. the Cloudflare dashboard's D1 console), **also insert a matching row into the `payload_migrations` table** so the engine does not try to reapply it on the next deploy. That table, along with `payload_preferences` and `payload_locked_documents*`, is internal engine bookkeeping — do not rename them.

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

## Portal theming

`src/app/(engage)/custom.css` carries the whole portal theme. Read its header comment before touching it — the colour system is easy to get wrong.

The short version: `--color-base-0 … --color-base-1000` is **one** ramp running light → dark, not one ramp per theme. The base stylesheet maps it onto `--theme-elevation-*` and inverts that mapping for dark mode. Supplying a second, already-inverted ramp inverts twice and produces light text on light surfaces. Define the ramp once, define all 21 steps, and let the inversion happen.

Override documented CSS custom properties, not class names. Declare inside `@layer payload` — that layer name is not ours to choose; the underlying CMS engine declares `@layer payload-default, payload;` and reserves the second layer for the host app, so a later layer always wins and nothing needs `!important`.

Brand marks live in `src/components/branding/`, and the browser-tab identity (title, description, favicon) is set explicitly in `admin.meta` in `engage.config.ts`.

---

## Known constraints

- **Paid Workers plan required** — the bundle exceeds the 3 MB free-tier [size limit](https://developers.cloudflare.com/workers/platform/limits/#worker-size).
- **GraphQL** is not guaranteed when deployed, pending an [upstream workerd fix](https://github.com/cloudflare/workerd/issues/5175). The REST API is unaffected.
- **Logging is opt-in** in the Cloudflare panel because it draws on your quota. The custom console logger in `engage.config.ts` exists because the default logger uses `pino-pretty`, which needs Node APIs Workers does not have and fails with `fs.write is not implemented`. It is production-only; dev keeps the prettier default.
- **No image processing.** `crop` and `focalPoint` are disabled on the Media collection because `sharp` is not available on Workers. Resizing/optimisation is expected to come from Cloudflare's image pipeline instead.
- **"Failed to publish diagnostic channel message"** entries in observability logs come from the `undici` HTTP client and are noise rather than a fault.
