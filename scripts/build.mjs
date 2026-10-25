// `npm run build` entry point.
// Cloudflare Workers Builds (WORKERS_CI=1) runs `npm run build` and then
// `npx wrangler deploy`, which needs the OpenNext output. Build it here, but only
// for the production branch: `wrangler deploy` publishes to the live worker, so a
// pull-request branch must keep failing at deploy (no OpenNext output) instead of
// replacing production. Everywhere else keep plain `next build`.
import { spawnSync } from 'node:child_process'

const PRODUCTION_BRANCH = process.env.PRODUCTION_BRANCH || 'main'
const onWorkersBuilds = process.env.WORKERS_CI === '1' || process.env.WORKERS_CI === 'true'
const onProductionBranch = process.env.WORKERS_CI_BRANCH === PRODUCTION_BRANCH
const args = onWorkersBuilds && onProductionBranch
  ? ['opennextjs-cloudflare', 'build', '--dangerouslyUseUnsupportedNextVersion']
  : ['next', 'build']

const result = spawnSync('npx', ['--no-install', ...args], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    NODE_OPTIONS: process.env.NODE_OPTIONS ?? '--no-deprecation --max-old-space-size=8000',
  },
})
process.exit(result.status ?? 1)
