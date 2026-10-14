/**
 * Email-safe HTML for a designed email: a 600px table-based layout with the brand
 * header (logo) and footer around the blocks. Pure: no I/O.
 */

import type { TemplateValues } from '../renderTemplate'

import { type EmailBrand, brandFrom, fontCss } from './brand'
import { escapeHtml, fillHtml } from './inline'
import { renderRows, type RenderContext } from './renderBlocks'
import type { EmailBlock } from './types'

export type RenderEmailOptions = {
  /** Short preview line shown by the inbox next to the subject. Tags are filled. */
  preheader?: string
  /** Value for each {{tag}}. */
  vars?: TemplateValues
  /** Document title, rarely seen. */
  title?: string
}

const MOBILE_STYLE = `@media only screen and (max-width: 620px) {
  .container { width: 100% !important; max-width: 100% !important; }
  .stack { display: block !important; width: 100% !important; max-width: 100% !important; }
  .pad { padding-left: 16px !important; padding-right: 16px !important; }
}`

const logoRow = (brand: EmailBrand): string => {
  if (!brand.logoUrl) return ''
  return `<tr><td align="center" class="pad" style="padding:24px 24px 8px 24px;"><img src="${escapeHtml(brand.logoUrl)}" alt="" width="${brand.logoWidth}" style="display:block;border:0;outline:none;text-decoration:none;height:auto;width:${brand.logoWidth}px;max-width:100%;margin:0 auto;" /></td></tr>`
}

const footerRows = (brand: EmailBrand, vars: TemplateValues): string => {
  if (!brand.footerText && !brand.address) return ''
  const font = fontCss(brand.fontStack)
  const footer = brand.footerText ? `<p style="margin:0 0 8px 0;font-family:${font};font-size:12px;line-height:1.5;color:#666666;">${fillHtml(brand.footerText, vars)}</p>` : ''
  const address = brand.address ? `<p style="margin:0;font-family:${font};font-size:12px;line-height:1.5;color:#666666;">${fillHtml(brand.address, vars)}</p>` : ''
  return `<tr><td class="pad" align="center" style="padding:16px 24px 24px 24px;border-top:1px solid #e5e5e5;">${footer}${address}</td></tr>`
}

/** The complete HTML document for a designed email. */
export const renderEmailHtml = (blocks: EmailBlock[], input: EmailBrand, options: RenderEmailOptions = {}): string => {
  const brand = brandFrom(input)
  const vars = options.vars ?? {}
  const ctx: RenderContext = { brand, vars }
  const preheader = options.preheader ? fillHtml(options.preheader, vars) : ''
  const body = blocks.map((block) => renderRows(block, ctx)).join('')
  const title = escapeHtml(options.title ?? '')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${title}</title>
<style>
${MOBILE_STYLE}
</style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:${brand.background};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${brand.background};opacity:0;">${preheader}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${brand.background};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" class="container" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:600px;background-color:${brand.contentBackground};">
${logoRow(brand)}${body}${footerRows(brand, vars)}
</table>
</td></tr>
</table>
</body>
</html>
`
}
