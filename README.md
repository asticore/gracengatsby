# Grace & Gatsby — Payload + Cloudflare Workers site

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/asticore/gracengatsby)

A full Payload CMS site (pages, blog, FAQ, shop/ecommerce, events, header/footer globals, page builder blocks) running on Cloudflare Workers with a D1 (SQLite) database and an R2 media bucket. This repo doubles as a reusable template: clicking the button above provisions a brand-new Worker, D1 database and R2 bucket for whoever clicks it, pre-loaded with this site's full feature set.

**This can only be deployed on Paid Workers right now due to size limits.**

## Quick start (one-click deploy)

1. Click the **Deploy to Cloudflare** button above.
2. Cloudflare will ask you to connect a git provider (GitHub/GitLab) — it forks/copies this repo into your own account so you have your own copy to edit.
3. On the setup screen, name your **Worker**, **D1 database** and **R2 bucket**. Give each client/project distinct names here (e.g. `client-name-site`, `client-name-db`, `client-name-media`) — Cloudflare provisions fresh resources under those names, so this is what keeps each deployment's data isolated from every other site deployed from this template.
4. Fill in the secrets it prompts for (see `.env.example` for the full list — `PAYLOAD_SECRET` is required, the Stripe keys are only needed if you want the shop enabled).
5. Deploy. Cloudflare runs the build/deploy script (`pnpm run deploy`), which applies the Payload database migrations to the new D1 database and pushes the Worker.
6. Visit `/admin` on your new deployment to create your first admin user and start configuring Header, Footer, Site Settings, Blog/FAQ/Shop settings and pages.

## Reusing this as a template for other client sites

Two ways to spin up a new client site from this codebase:

- **Fastest**: click the Deploy to Cloudflare button above directly from this repo. Cloudflare copies the repo into your GitHub account as part of the flow and provisions a new Worker/D1/R2 for it — just make sure you give the resources unique names in step 3 above.
- **Cleaner for ongoing client work** (recommended if you'll keep customizing each client's copy in git): mark this repo as a GitHub template repository once (Settings → General → check "Template repository"), then for each new client use GitHub's **"Use this template"** button to create a separate repo, and click Deploy to Cloudflare from that new repo. This keeps each client's code and deploy history fully separate.

Either way, every deployment gets its own isolated D1 database and R2 bucket — nothing is shared with `gracengatsby.com`'s production data as long as you give each deployment distinct resource names during setup.

## Quick Start - local setup

To spin up this template locally, follow these steps:

### Clone

After you click the `Deploy` button above, you'll want a standalone copy of this repo on your machine. Cloudflare will connect your app to a git provider such as GitHub and you can access your code from there.

### Local Development

Copy `.env.example` to `.env` and fill in the values, then:

```bash
pnpm install
pnpm dev
```

## How it works

Out of the box, using [`Wrangler`](https://developers.cloudflare.com/workers/wrangler/) will automatically create local bindings for you to connect to the remote services and it can even create a local mock of the services you're using with Cloudflare.

This site is built on:

### Collections

See the [Collections](https://payloadcms.com/docs/configuration/collections) docs for details on how to extend this functionality.

- **Pages** — hierarchical (parent/child), homepage flag, starter templates, SEO fields, and a block-based page builder (hero, rich text, image+text, product grid, event grid, gallery, FAQ, CTA banner).
- **Posts** — blog collection with categories and SEO fields.
- **FAQs** — question/answer entries, groupable by category.
- **Page Templates** — reusable starter block layouts for new pages.
- **Products / Events** — ecommerce and events, via `@payloadcms/plugin-ecommerce`.
- **Users** (Authentication) — auth-enabled collection with admin panel access. See the official [Auth Example](https://github.com/payloadcms/payload/tree/main/examples/auth) or the [Authentication](https://payloadcms.com/docs/authentication/overview#authentication-overview) docs.
- **Media** — uploads-enabled collection, backed by R2.

### Globals

- **Header** / **Footer** — nav menus, socials, announcement bar, footer columns.
- **Site Settings** — theme (button/corner/hover styles), SEO defaults, feature toggles (ecommerce, events, blog, faq, accounts, lms).
- **Blog / FAQ / Shop settings** — per-section layout and display options.

### Image Storage (R2)

Images will be served from an R2 bucket which you can then further configure to use a CDN to serve for your frontend directly.

### D1 Database

The Worker will have direct access to a D1 SQLite database which Wrangler can connect locally to, just note that you won't have a connection string as you would typically with other providers.

You can enable read replicas by adding `readReplicas: 'first-primary'` in the DB adapter and then enabling it on your D1 Cloudflare dashboard. Read more about this feature on [our docs](https://payloadcms.com/docs/database/sqlite#d1-read-replicas).

## Working with Cloudflare

Firstly, after installing dependencies locally you need to authenticate with Wrangler by running:

```bash
pnpm wrangler login
```

This will take you to Cloudflare to login and then you can use the Wrangler CLI locally for anything, use `pnpm wrangler help` to see all available options.

Wrangler is pretty smart so it will automatically bind your services for local development just by running `pnpm dev`.

## Deployments

When you're ready to deploy, first make sure you have created your migrations:

```bash
pnpm payload migrate:create
```

Then run the following command:

```bash
pnpm run deploy
```

This will spin up Wrangler in `production` mode, run any created migrations against D1, build the app and then deploy the bundle up to Cloudflare. That's it! You can if you wish move these steps into your CI pipeline as well.

**Note:** if you ever apply a schema change directly against a production D1 database outside of `payload migrate` (for example via the Cloudflare dashboard's D1 console), remember to also insert a matching row into the `payload_migrations` table so Payload doesn't try to reapply it on the next deploy.

## Enabling logs

By default logs are not enabled for your API, we've made this decision because it does run against your quota so we've left it opt-in. But you can easily enable logs in one click in the Cloudflare panel, [see docs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/#enable-workers-logs).

### Logger Configuration

This template includes a custom console-based logger compatible with Cloudflare Workers. Payload's default logger uses `pino-pretty`, which relies on Node.js APIs not available in Workers and would cause `fs.write is not implemented` errors.

The custom logger in `payload.config.ts`:

- Routes logs through `console.*` methods which Workers handles correctly
- Outputs JSON-formatted logs for Cloudflare observability
- Only active in production (development uses the default `pino-pretty` for better DX)

You can control the log level via the `PAYLOAD_LOG_LEVEL` environment variable (e.g., `debug`, `info`, `warn`, `error`).

### Diagnostic Channel Errors

If you see "Failed to publish diagnostic channel message" errors in your observability logs, these typically come from the `undici` HTTP client library. The template includes `skipSafeFetch: true` in the Media collection to use native fetch instead of undici for file uploads, which helps reduce these errors.

Cloudflare Workers runs in an [isolated environment that cannot access private IP ranges](https://developers.cloudflare.com/workers-vpc/examples/route-across-private-services/) by default, providing built-in SSRF protection. This makes `skipSafeFetch` safe to use.

## Known issues

### GraphQL

We are currently waiting on some issues with GraphQL to be [fixed upstream in Workers](https://github.com/cloudflare/workerd/issues/5175) so full support for GraphQL is not currently guaranteed when deployed.

### Worker size limits

We currently recommend deploying this template to the Paid Workers plan due to bundle [size limits](https://developers.cloudflare.com/workers/platform/limits/#worker-size) of 3mb. We're actively trying to reduce our bundle footprint over time to better meet this metric.

This also applies to your own code, in the case of importing a lot of libraries you may find yourself limited by the bundle.

## Questions

If you have any issues or questions, reach out to us on [Discord](https://discord.com/invite/payload) or start a [GitHub discussion](https://github.com/payloadcms/payload/discussions).
