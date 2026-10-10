import { notFound, renderAppAdsTxt, siteFileResponse } from '@/features/seo/siteFilesData'

// Settings are read from the database on every request, so this can never be
// prerendered at build time.
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const body = await renderAppAdsTxt()
  return body === null ? notFound() : siteFileResponse(body)
}