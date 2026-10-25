// `npm run build` entry point.
// Cloudflare Workers Builds (WORKERS_CI=1) runs `npm run build` and then
// `npx wrangler deploy`, which needs the OpenNext output. Branch builds have no
// other step that creates it, so build it here. Everywhere else keep plain `next build`.
import { spawnSync } from 'node:child_process'

const onWorkersBuilds = process.env.WORKERS_CI === '1' || process.env.WORKERS_CI === 'true'
const args = onWorkersBuilds
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
