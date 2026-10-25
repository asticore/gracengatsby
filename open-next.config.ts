// default open-next.config.ts file created by @opennextjs/cloudflare
import { defineCloudflareConfig } from '@opennextjs/cloudflare/config'

// `npm run build` runs the OpenNext build on Cloudflare Workers Builds (see
// scripts/build.mjs), so OpenNext must call Next directly or it would loop.
// defineCloudflareConfig drops unknown keys, hence the spread.
export default {
  ...defineCloudflareConfig({}),
  buildCommand: 'next build',
}
