'use client'

import Link from 'next/link'
import React, { useRef, useSyncExternalStore } from 'react'
import type { Field } from '@/engine'
import { useFormFields } from '@/admin/context'
import { resolveActiveTab } from '@/admin/settingsPages'
import { renderInvoiceHtml, type InvoiceOrder, type InvoiceStore } from '@/features/ecommerce/lib/invoice'
import { SHOP_TABS } from '@/features/ecommerce/settingsFields'
import { EditForm } from './EditForm'
import { CarrierTestPanel, PaymentTestButtons } from './ShopTestButtons'
import { PayPalWebhookHelp } from './PayPalWebhookHelp'
import '@/app/(engage)/settings-tabs.css'
import './shop-settings.css'

export const SHOP_SETTINGS_TABS = [
  { slug: 'general', label: 'General' },
  { slug: 'payments', label: 'Payments' },
  { slug: 'shipping', label: 'Shipping' },
  { slug: 'invoices', label: 'Invoices and receipts' },
  { slug: 'gift-cards', label: 'Gift cards and store credit' },
  { slug: 'checkout', label: 'Checkout' },
  { slug: 'emails', label: 'Emails' },
  { slug: 'storefront', label: 'Storefront layout' },
] as const

const TAB_SLUGS: readonly string[] = SHOP_SETTINGS_TABS.map((t) => t.slug)
const TAB_SELECT_EVENT = 'shop-settings-tabs:select'

function subscribeToHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  window.addEventListener('popstate', onChange)
  window.addEventListener(TAB_SELECT_EVENT, onChange)
  return () => {
    window.removeEventListener('hashchange', onChange)
    window.removeEventListener('popstate', onChange)
    window.removeEventListener(TAB_SELECT_EVENT, onChange)
  }
}
const readHash = () => window.location.hash
const readServerHash = () => ''

const SAMPLE_ORDER: InvoiceOrder = {
  id: 1042,
  orderNumber: '1042',
  createdAt: '2026-01-15T00:00:00.000Z',
  paidAt: '2026-01-15T00:00:00.000Z',
  status: 'processing',
  currency: 'AUD',
  customerEmail: 'customer@example.com',
  customerNote: 'Please leave at the front door.',
  shippingAddress: { firstName: 'Alex', lastName: 'Sample', address1: '1 Example St', city: 'Sydney', state: 'NSW', postcode: '2000', country: 'AU' },
  lineItems: [
    { name: 'Linen shirt', sku: 'LS-01', quantity: 2, unitCents: 6000, lineCents: 12000, discountCents: 0, taxCents: 1091 },
    { name: 'Canvas tote', sku: 'CT-02', quantity: 1, unitCents: 3500, lineCents: 3500, discountCents: 500, taxCents: 273 },
  ],
  subtotal: 15500,
  shippingTotal: 900,
  taxTotal: 1364,
  amount: 16400,
  pricesIncludeTax: true,
  taxLines: [{ name: 'GST', ratePct: 10, taxCents: 1364 }],
  couponLines: [{ code: 'WELCOME', discountCents: 500 }],
  shippingMethod: { title: 'Standard shipping' },
}

const SAMPLE_STORE: InvoiceStore = { name: 'Your shop', abn: '12 345 678 901', address: '1 Shop Lane, Sydney NSW 2000', email: 'hello@example.com' }

const INVOICE_KEYS = [
  'logoUrl', 'logoHeight', 'accentColor', 'textColor', 'fontFamily', 'fontSize', 'headerText', 'footerText', 'terms', 'notes',
  'showSku', 'showUnitPrice', 'showDiscount', 'showTax', 'showShipping', 'showCustomerNote', 'showPaymentStatus',
  'titleMode', 'taxInvoiceTitle', 'invoiceTitle', 'receiptTitle', 'numberPrefix', 'nextNumber', 'numberPadding', 'paperSize', 'packingSlipEnabled', 'packingSlipNote',
]

/** Reads the invoice group from the live form (unsaved edits included) and renders a sample invoice. */
const InvoicePreview: React.FC = () => {
  const values = useFormFields(([fields]) => {
    const out: Record<string, unknown> = {}
    for (const key of INVOICE_KEYS) out[key] = fields?.[`invoice.${key}`]?.value
    return JSON.stringify(out)
  })
  const html = renderInvoiceHtml(SAMPLE_ORDER, SAMPLE_STORE, JSON.parse(values) as Record<string, unknown>)
  return (
    <div className="shop-settings__preview">
      <h3 className="shop-settings__preview-title">Live preview (sample order)</h3>
      <iframe title="Invoice preview" sandbox="" srcDoc={html} className="shop-settings__preview-frame" />
    </div>
  )
}

type Props = {
  shopDoc: Record<string, unknown>
  shopFields: Field[]
  paymentDoc: Record<string, unknown> | null
  paymentFields: Field[] | null
  shippingDoc?: Record<string, unknown> | null
  shippingFields?: Field[] | null
  /** The shop-extra-settings global (shop-wide switches such as pre-orders), shown in the Storefront tab. */
  extraDoc?: Record<string, unknown> | null
  extraFields?: Field[] | null
}

const SCOPED = new Set<string>([...SHOP_TABS.general, ...SHOP_TABS.giftCards, ...SHOP_TABS.checkout, ...SHOP_TABS.emails, 'invoice'])

/**
 * One Shop settings screen. Each tab is its own EditForm over the shop-settings global (scoped with
 * onlyFields), keyed on updatedAt so a save in one tab never leaves another tab holding stale values
 * that would be written back on its own save. Payments is the payment-settings global.
 */
export const ShopSettingsClient: React.FC<Props> = ({ shopDoc, shopFields, paymentDoc, paymentFields, shippingDoc, shippingFields, extraDoc, extraFields }) => {
  const hash = useSyncExternalStore(subscribeToHash, readHash, readServerHash)
  const active = resolveActiveTab(hash, TAB_SLUGS)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const stamp = String(shopDoc.updatedAt ?? 'new')

  const layoutNames = shopFields.flatMap((f) => ('name' in f && typeof f.name === 'string' ? [f.name] : (f as { fields?: Field[] }).fields?.flatMap((x) => ('name' in x && typeof x.name === 'string' ? [x.name] : [])) ?? [])).filter((n) => !SCOPED.has(n))

  const select = (slug: string) => {
    window.history.replaceState(null, '', `#${slug}`)
    window.dispatchEvent(new Event(TAB_SELECT_EVENT))
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = TAB_SLUGS.length - 1
    let next: number
    switch (event.key) {
      case 'ArrowRight':
        next = index === last ? 0 : index + 1
        break
      case 'ArrowLeft':
        next = index === 0 ? last : index - 1
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = last
        break
      default:
        return
    }
    event.preventDefault()
    select(TAB_SLUGS[next])
    tabRefs.current[next]?.focus()
  }

  const panel = (slug: string, children: React.ReactNode) => (
    <div id={`ss-panel-${slug}`} role="tabpanel" aria-labelledby={`ss-tab-${slug}`} hidden={active !== slug} tabIndex={0} className="settings-tabs__panel">
      {children}
    </div>
  )

  const shopForm = (names: readonly string[], extra?: { afterFields?: React.ReactNode }) => (
    <EditForm key={`${names.join('-')}:${stamp}`} doc={shopDoc} fields={shopFields} globalSlug="shop-settings" onlyFields={[...names]} afterFields={extra?.afterFields} />
  )

  return (
    <div className="settings-page ss-page">
      <div className="settings-page__header">
        <h1 className="settings-page__title">Shop settings</h1>
        <p className="settings-page__description">Currency and units, payments, shipping, invoices, gift cards, checkout and emails in one place. Hover the ? next to a setting to see what it does.</p>
      </div>
      <div className="settings-page__sections">
        <div className="settings-page__section settings-tabs">
          <div role="tablist" aria-label="Shop settings" className="settings-tabs__list">
            {SHOP_SETTINGS_TABS.map((tab, index) => (
              <button
                key={tab.slug}
                ref={(el) => {
                  tabRefs.current[index] = el
                }}
                id={`ss-tab-${tab.slug}`}
                role="tab"
                type="button"
                aria-selected={tab.slug === active}
                aria-controls={`ss-panel-${tab.slug}`}
                tabIndex={tab.slug === active ? 0 : -1}
                className="settings-tabs__tab"
                onClick={() => select(tab.slug)}
                onKeyDown={(event) => onKeyDown(event, index)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {panel('general', shopForm(SHOP_TABS.general))}
          {panel(
            'payments',
            paymentDoc && paymentFields ? (
              <EditForm key={`payments:${String(paymentDoc.updatedAt ?? 'new')}`} doc={paymentDoc} fields={paymentFields} globalSlug="payment-settings" afterFields={<><PaymentTestButtons /><PayPalWebhookHelp /></>} />
            ) : (
              <p>You do not have access to the payment settings.</p>
            ),
          )}
          {panel(
            'shipping',
            <>
              <div className="shop-settings__links">
                <p>Shipping zones, rates and classes are managed in the Shop menu.</p>
                <ul>
                  <li><Link href="/admin/collections/shipping-zones">Shipping zones and rates</Link></li>
                  <li><Link href="/admin/collections/shipping-classes">Shipping classes</Link></li>
                </ul>
              </div>
              {shippingDoc && shippingFields ? (
                <EditForm key={`shipping:${String(shippingDoc.updatedAt ?? 'new')}`} doc={shippingDoc} fields={shippingFields} globalSlug="shipping-settings" afterFields={<CarrierTestPanel />} />
              ) : null}
            </>,
          )}
          {panel('invoices', shopForm(['invoice'], { afterFields: <InvoicePreview /> }))}
          {panel('gift-cards', shopForm(SHOP_TABS.giftCards))}
          {panel('checkout', shopForm(SHOP_TABS.checkout))}
          {panel('emails', shopForm(SHOP_TABS.emails))}
          {panel(
            'storefront',
            <>
              {shopForm(layoutNames)}
              {extraDoc && extraFields ? (
                <EditForm key={`shop-extra:${String(extraDoc.updatedAt ?? 'new')}`} doc={extraDoc} fields={extraFields} globalSlug="shop-extra-settings" />
              ) : null}
            </>,
          )}
        </div>
      </div>
    </div>
  )
}

export default ShopSettingsClient
