import { notFound, renderManifest, siteFileResponse } from '@/features/seo/siteFilesData'

// Settings are read from the database on every request, so this can never be
// prerendered at build time.
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const manifest = await renderManifest()
  return manifest === null ? notFound() : siteFileResponse(JSON.stringify(manifest, null, 2), 'application/manifest+json; charset=utf-8')
}