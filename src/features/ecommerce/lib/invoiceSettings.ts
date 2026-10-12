/**
 * Invoice and receipt look-and-feel, stored in the `invoice` group of the shop-settings global.
 * Everything that ends up inside the printed page is validated here (colours, fonts, URLs), so a
 * hand-edited value can never inject markup or CSS.
 */

export type TitleMode = 'auto' | 'tax-invoice' | 'invoice' | 'receipt'
export type PaperSize = 'A4' | 'Letter'
export type FontFamily = 'sans' | 'serif' | 'mono'

export type InvoiceSettings = {
  logoUrl: string
  /** px */
  logoHeight: number
  accentColor: string
  textColor: string
  fontFamily: FontFamily
  /** px */
  fontSize: number
  headerText: string
  footerText: string
  terms: string
  notes: string
  showSku: boolean
  showUnitPrice: boolean
  showDiscount: boolean
  showTax: boolean
  showShipping: boolean
  showCustomerNote: boolean
  showPaymentStatus: boolean
  titleMode: TitleMode
  taxInvoiceTitle: string
  invoiceTitle: string
  receiptTitle: string
  numberPrefix: string
  nextNumber: number
  numberPadding: number
  paperSize: PaperSize
  packingSlipEnabled: boolean
  packingSlipNote: string
}

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  logoUrl: '',
  logoHeight: 48,
  accentColor: '#111111',
  textColor: '#111111',
  fontFamily: 'sans',
  fontSize: 14,
  headerText: '',
  footerText: '',
  terms: '',
  notes: '',
  showSku: true,
  showUnitPrice: true,
  showDiscount: true,
  showTax: true,
  showShipping: true,
  showCustomerNote: true,
  showPaymentStatus: true,
  titleMode: 'auto',
  taxInvoiceTitle: 'Tax invoice',
  invoiceTitle: 'Invoice',
  receiptTitle: 'Receipt',
  numberPrefix: 'INV-',
  nextNumber: 1,
  numberPadding: 5,
  paperSize: 'A4',
  packingSlipEnabled: true,
  packingSlipNote: '',
}

export const FONT_STACKS: Record<FontFamily, string> = {
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, Menlo, Consolas, monospace",
}

const text = (v: unknown, max: number, fallback = ''): string => (typeof v === 'string' ? v.trim().slice(0, max) : fallback)
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback)
const int = (v: unknown, min: number, max: number, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback)
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
const color = (v: unknown, fallback: string): string => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim() : fallback)

/** Only https URLs, site-relative paths and small data images are allowed for the logo. */
export function safeLogoUrl(v: unknown): string {
  if (typeof v !== 'string') return ''
  const url = v.trim()
  if (!url || url.length > 2000) return ''
  if (/^https:\/\//i.test(url) || (/^\/(?!\/)/.test(url))) return /[\s"'<>]/.test(url) ? '' : url
  return ''
}

export function normaliseInvoiceSettings(raw: unknown): InvoiceSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_INVOICE_SETTINGS
  return {
    logoUrl: safeLogoUrl(r.logoUrl),
    logoHeight: int(r.logoHeight, 16, 160, d.logoHeight),
    accentColor: color(r.accentColor, d.accentColor),
    textColor: color(r.textColor, d.textColor),
    fontFamily: r.fontFamily === 'serif' || r.fontFamily === 'mono' ? r.fontFamily : 'sans',
    fontSize: int(r.fontSize, 9, 20, d.fontSize),
    headerText: text(r.headerText, 1000),
    footerText: text(r.footerText, 1000),
    terms: text(r.terms, 4000),
    notes: text(r.notes, 2000),
    showSku: bool(r.showSku, d.showSku),
    showUnitPrice: bool(r.showUnitPrice, d.showUnitPrice),
    showDiscount: bool(r.showDiscount, d.showDiscount),
    showTax: bool(r.showTax, d.showTax),
    showShipping: bool(r.showShipping, d.showShipping),
    showCustomerNote: bool(r.showCustomerNote, d.showCustomerNote),
    showPaymentStatus: bool(r.showPaymentStatus, d.showPaymentStatus),
    titleMode: r.titleMode === 'tax-invoice' || r.titleMode === 'invoice' || r.titleMode === 'receipt' ? r.titleMode : 'auto',
    taxInvoiceTitle: text(r.taxInvoiceTitle, 40, d.taxInvoiceTitle) || d.taxInvoiceTitle,
    invoiceTitle: text(r.invoiceTitle, 40, d.invoiceTitle) || d.invoiceTitle,
    receiptTitle: text(r.receiptTitle, 40, d.receiptTitle) || d.receiptTitle,
    numberPrefix: text(r.numberPrefix, 12, d.numberPrefix).replace(/[^A-Za-z0-9\-_/#.]/g, ''),
    nextNumber: int(r.nextNumber, 1, 999999999, d.nextNumber),
    numberPadding: int(r.numberPadding, 0, 10, d.numberPadding),
    paperSize: r.paperSize === 'Letter' ? 'Letter' : 'A4',
    packingSlipEnabled: bool(r.packingSlipEnabled, d.packingSlipEnabled),
    packingSlipNote: text(r.packingSlipNote, 1000),
  }
}

/** `INV-00042` from the prefix, the number and the padding. */
export function formatInvoiceNumber(settings: Pick<InvoiceSettings, 'numberPrefix' | 'numberPadding'>, n: number): string {
  return `${settings.numberPrefix}${String(Math.max(0, Math.floor(n))).padStart(settings.numberPadding, '0')}`
}

export function documentTitle(settings: InvoiceSettings, order: { taxTotal?: number | null; taxLines?: { name?: string; taxCents?: number }[] | null }): string {
  const gst = (order.taxLines ?? []).some((t) => (t.taxCents ?? 0) > 0 && /gst/i.test(t.name ?? '')) || (order.taxTotal ?? 0) > 0
  switch (settings.titleMode) {
    case 'receipt':
      return settings.receiptTitle
    case 'tax-invoice':
      return settings.taxInvoiceTitle
    case 'invoice':
      return settings.invoiceTitle
    default:
      return gst ? settings.taxInvoiceTitle : settings.invoiceTitle
  }
}
