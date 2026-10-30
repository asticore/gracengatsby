import { buildWebhookGuideMarkdown, markdownSectionToHtml, webhookSectionMarkdown } from '@/features/webhooks/docs'
import { gate } from '@/features/webhooks/gate'
import { siteNameFor } from '@/features/apiBuilder/guideResponse'

export const dynamic = 'force-dynamic'

/**
 * GET ?format=guide.md|guide.html: the webhooks guide as a download. Signed-in admins, or holders of
 * the `webhooks` read permission only. It holds no signing secrets and no site-specific keys.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await gate('read')
  if (session.ok === false) return Response.json({ error: session.error }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
  const format = new URL(request.url).searchParams.get('format')
  if (format !== 'guide.md' && format !== 'guide.html') return Response.json({ error: 'Unknown format.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  const siteName = await siteNameFor(session.engine)
  const generatedAt = new Date().toISOString().slice(0, 10)
  if (format === 'guide.md') {
    return new Response(buildWebhookGuideMarkdown(siteName, generatedAt), {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Disposition': 'attachment; filename="webhooks-guide.md"',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
      },
    })
  }
  const safeName = siteName.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
  const html = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="robots" content="noindex, nofollow, noarchive">\n<title>${safeName} webhooks</title>\n<style>body{font-family:system-ui,sans-serif;max-width:860px;margin:0 auto;padding:16px;line-height:1.5}pre{background:#f4f4f4;padding:12px;overflow:auto;border-radius:6px}code{font-family:ui-monospace,monospace}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:4px 8px;text-align:left}@media (prefers-color-scheme:dark){body{background:#111;color:#eee}pre{background:#222}td,th{border-color:#444}}</style>\n</head>\n<body>\n<h1>${safeName}</h1>\n${markdownSectionToHtml(webhookSectionMarkdown())}\n</body>\n</html>\n`
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Disposition': 'attachment; filename="webhooks-guide.html"',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  })
}
