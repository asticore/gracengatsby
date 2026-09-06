# Cloudflare Workers Build fix (dashboard-only, not in this repo)

The `gracengatsby` Cloudflare Workers service kept failing to build with
errors traceable to the wrong package manager (`bun`) resolving dependencies
instead of `pnpm`, then later `ERR_PNPM_NO_LOCKFILE`. Both are dashboard
settings, not anything in this repo - documented here since nothing in git
shows the fix otherwise.

## Root cause

Cloudflare Workers Builds' own automatic dependency-install step does not
respect the `packageManager` field in `package.json` the way its "detected
tools" log line implies - it appears to select an install command by probing
for a lockfile file (`bun.lock`, `yarn.lock`, `pnpm-lock.yaml`,
`package-lock.json`), and this repo intentionally has none of those
committed (see `.gitignore`'s comment above its `pnpm-lock.yaml` line: this
template runs a fresh `pnpm install` on every deploy rather than pinning a
lockfile). With no lockfile file to match, it fell back to `bun install`,
which re-resolved transitive dependency versions differently than a `pnpm
install` would and triggered a build-time `TypeError` collecting page data
for `/api/ab-track`.

## Fix (Settings -> Builds, on the Cloudflare dashboard)

1. Build variable: `SKIP_DEPENDENCY_INSTALL=1` (Settings -> Builds ->
   Variables and secrets, the Builds-scoped section, not the Runtime one) -
   stops Cloudflare's own automatic install step from running at all.
2. Build command (Settings -> Builds -> Build configuration):
   `pnpm install --no-frozen-lockfile && npm run build` - installs with pnpm
   ourselves. `--no-frozen-lockfile` (not `--frozen-lockfile`) because there
   is no committed lockfile for pnpm to freeze against - see the root-cause
   note above; using `--frozen-lockfile` here fails outright with
   `ERR_PNPM_NO_LOCKFILE`.

Both are confirmed saved and persisted (checked via full page reload, not
just the in-page "saved" state) as of this commit. Deploy command
(`npm run deploy`) and Version command (`npx wrangler deploy`) were left
untouched - unrelated to this failure.
