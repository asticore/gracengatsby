import { carrierDef, missingCredentialKeys } from '../shipping/catalogue'
import { normaliseShippingConfig } from '../shipping/registry'

/** Pure helpers behind the Orders list "Create manifest" action. Safe to test without a database. */

export type ManifestCarrierOption = { id: string; label: string }
export type ManifestOrderOption = { id: number; orderNumber: string; name: string }

/** Carriers switched on in Shop settings > Shipping with every saved key filled in. */
export function manifestCarrierOptions(shippingDoc: unknown): ManifestCarrierOption[] {
  return normaliseShippingConfig(shippingDoc).carriers.flatMap((carrier) => {
    const def = carrierDef(carrier.id)
    if (!carrier.enabled || !def || missingCredentialKeys(def, carrier.creds.values).length > 0) return []
    return [{ id: carrier.id, label: def.label }]
  })
}

/** Labelled orders for the order checklist, shaped for the admin picker. Names only, no contact details. */
export function labelledOrderOptions(docs: Record<string, unknown>[]): ManifestOrderOption[] {
  return docs.flatMap((doc) => {
    const id = Number(doc.id)
    if (!Number.isInteger(id)) return []
    const address = (doc.shippingAddress && typeof doc.shippingAddress === 'object' ? doc.shippingAddress : {}) as Record<string, unknown>
    const name = [address.firstName, address.lastName].filter((part): part is string => typeof part === 'string' && part.trim() !== '').join(' ')
    const orderNumber = typeof doc.orderNumber === 'string' && doc.orderNumber ? doc.orderNumber : String(id)
    return [{ id, orderNumber, name: name || 'No name' }]
  })
}
