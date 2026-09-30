'use client'

/**
 * Engine seam: shop client hooks and context provider.
 *
 * Cart, addresses, and payment state for the storefront. Ships to the
 * browser bundle, so it is kept apart from the server-side ../commerce.ts.
 *
 * See ../index.ts for what this directory is and the rules that govern it.
 *
 * From-scratch replacement (2026-09-27, the plan doc - the last
 * of `the vendor package`'s client/hook surface) for the real
 * plugin's `EcommerceProvider`/`useCart`/`useAddresses`/`usePayments`
 * (`client/react`). Talks directly to this app's own from-scratch REST
 * endpoints (`src/localapi/rest.ts`'s cart-item and payments handlers,
 * Stage 10 Ecommerce) - there is no the original engine server behind this at all.
 *
 * Guest-cart only: this app never assigns a `customer` to a cart on
 * creation (`../../features/ecommerce/hooks/cartHooks.ts`'s
 * `beforeChangeCart` only skips secret-generation when `data.customer` is
 * already set, and nothing in this app ever sets it), so every cart here is
 * secret-based regardless of sign-in state. The cart's numeric id and guest
 * secret are persisted to `localStorage` so a returning visitor keeps their
 * cart, and threaded onto every request (`?secret=` for reads, body
 * `secret` for the POST actions) exactly like `rest.ts`'s cart handlers
 * expect (`hasCartSecretAccess`, `@/access/ecommerceAccess`). Nothing in
 * this app's UI currently calls the server's `/merge` endpoint (a signed-in
 * customer never gets their guest cart merged into an account cart today -
 * out of scope for this pass, and unchanged from before this file existed),
 * so this client doesn't need to either.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const CART_STORAGE_KEY = 'gracengatsby-cart'
const API_ROUTE = '/api'

type StoredCartRef = { id: number; secret: string }

export type CartItemDoc = {
  id: string
  product: number | Record<string, unknown>
  quantity: number
}

export type CartDoc = {
  id: number
  items?: CartItemDoc[]
  subtotal?: number
  currency?: string
  secret?: string
  [key: string]: unknown
}

export type AddressDoc = { id: number; [key: string]: unknown }

type PaymentArgs = { additionalData?: Record<string, unknown> }
type InitiatePaymentResult = { clientSecret?: string; message?: string }
type ConfirmOrderResult = { orderID?: number; transactionID?: number; message?: string }

type CartContextValue = {
  cart: CartDoc | null
  cartLoading: boolean
  addItem: (item: { product: number }, quantity?: number) => Promise<void>
  incrementItem: (itemID: string) => Promise<void>
  decrementItem: (itemID: string) => Promise<void>
  removeItem: (itemID: string) => Promise<void>
  addresses: AddressDoc[]
  addressesLoading: boolean
  paymentsLoading: boolean
  initiatePayment: (method: string, args: PaymentArgs) => Promise<InitiatePaymentResult>
  confirmOrder: (method: string, args: PaymentArgs) => Promise<ConfirmOrderResult>
}

const CartContext = createContext<CartContextValue | null>(null)

function readStoredCart(): StoredCartRef | null {
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredCartRef>
    if (typeof parsed.id === 'number' && typeof parsed.secret === 'string') return { id: parsed.id, secret: parsed.secret }
    return null
  } catch {
    return null
  }
}

function writeStoredCart(ref: StoredCartRef | null): void {
  try {
    if (ref) window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(ref))
    else window.localStorage.removeItem(CART_STORAGE_KEY)
  } catch {
    // localStorage unavailable (private browsing, disabled) - the cart
    // still works for the current page load, it just won't survive a
    // reload.
  }
}

async function fetchCart(ref: StoredCartRef): Promise<CartDoc | null> {
  const res = await fetch(`${API_ROUTE}/carts/${ref.id}?secret=${encodeURIComponent(ref.secret)}&depth=2`, {
    credentials: 'same-origin',
  })
  if (!res.ok) return null
  const doc = (await res.json().catch((): null => null)) as CartDoc | null
  if (!doc || typeof doc.id !== 'number') return null
  return doc
}

async function createCart(currency: string): Promise<{ cart: CartDoc; ref: StoredCartRef } | null> {
  const res = await fetch(`${API_ROUTE}/carts`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currency }),
  })
  if (!res.ok) return null
  const body = (await res.json().catch((): null => null)) as { doc?: CartDoc } | null
  const doc = body?.doc
  if (!doc || typeof doc.id !== 'number' || typeof doc.secret !== 'string') return null
  return { cart: doc, ref: { id: doc.id, secret: doc.secret } }
}

export const EcommerceProvider: React.FC<{ children: React.ReactNode; defaultCurrency?: string }> = ({
  children,
  defaultCurrency = 'AUD',
}) => {
  const [cart, setCart] = useState<CartDoc | null>(null)
  const [cartRef, setCartRef] = useState<StoredCartRef | null>(null)
  const [cartLoading, setCartLoading] = useState(true)
  const [addresses, setAddresses] = useState<AddressDoc[]>([])
  const [addressesLoading, setAddressesLoading] = useState(true)
  const [paymentsLoading, setPaymentsLoading] = useState(false)

  // Load (or create) the guest cart once on mount - client-only.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const stored = readStoredCart()
      const existing = stored ? await fetchCart(stored) : null
      if (cancelled) return
      if (existing && stored) {
        setCart(existing)
        setCartRef(stored)
        setCartLoading(false)
        return
      }
      // Stale/invalid stored ref (expired secret, deleted cart) or no ref
      // at all - either way, start fresh.
      const created = await createCart(defaultCurrency)
      if (cancelled) return
      if (created) {
        writeStoredCart(created.ref)
        setCart(created.cart)
        setCartRef(created.ref)
      }
      setCartLoading(false)
    })()
    return () => {
      cancelled = true
    }
    // defaultCurrency comes from the one call site (Providers.tsx) and is
    // never expected to change across the provider's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Saved addresses - only ever populated for a signed-in customer
  // (Addresses.ts's own access: isAdmin || isDocumentOwner). A guest
  // request is denied, which is expected and just means an empty address
  // book here, same as this component never having fetched at all.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`${API_ROUTE}/addresses?limit=50&depth=0`, { credentials: 'same-origin' })
        if (!cancelled && res.ok) {
          const result = (await res.json()) as { docs?: AddressDoc[] }
          setAddresses(result.docs ?? [])
        }
      } catch {
        // Network error, or a guest's 403 - either way, no saved addresses.
      } finally {
        if (!cancelled) setAddressesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const mutateCart = useCallback(async (ref: StoredCartRef, path: string, body: Record<string, unknown>) => {
    setCartLoading(true)
    try {
      const res = await fetch(`${API_ROUTE}/carts/${ref.id}/${path}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, secret: ref.secret }),
      })
      if (res.ok) {
        // Re-fetch at depth 2 rather than trust the mutation's own response
        // shape - the storefront (cart page) needs populated `product`
        // relations to show title/price, and the mutation handlers don't
        // take a depth of their own (see rest.ts's cart-item handlers).
        const refreshed = await fetchCart(ref)
        if (refreshed) setCart(refreshed)
      } else {
        const failure = (await res.json().catch((): null => null)) as { message?: string } | null
        console.error(`Cart update failed (${path}): ${failure?.message ?? res.status}`)
      }
    } finally {
      setCartLoading(false)
    }
  }, [])

  const addItem = useCallback(
    async (item: { product: number }, quantity = 1) => {
      if (!cartRef) return
      await mutateCart(cartRef, 'add-item', { item, quantity })
    },
    [cartRef, mutateCart],
  )

  const incrementItem = useCallback(
    async (itemID: string) => {
      if (!cartRef) return
      await mutateCart(cartRef, 'update-item', { itemID, quantity: { $inc: 1 } })
    },
    [cartRef, mutateCart],
  )

  const decrementItem = useCallback(
    async (itemID: string) => {
      if (!cartRef) return
      await mutateCart(cartRef, 'update-item', { itemID, quantity: { $inc: -1 } })
    },
    [cartRef, mutateCart],
  )

  const removeItem = useCallback(
    async (itemID: string) => {
      if (!cartRef) return
      await mutateCart(cartRef, 'remove-item', { itemID })
    },
    [cartRef, mutateCart],
  )

  const initiatePayment = useCallback(
    async (_method: string, args: PaymentArgs): Promise<InitiatePaymentResult> => {
      if (!cartRef) return { message: 'Your cart is not ready yet.' }
      setPaymentsLoading(true)
      try {
        const res = await fetch(`${API_ROUTE}/payments/stripe/initiate`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cartID: cartRef.id, secret: cartRef.secret, ...args.additionalData }),
        })
        return (await res.json()) as InitiatePaymentResult
      } finally {
        setPaymentsLoading(false)
      }
    },
    [cartRef],
  )

  const confirmOrder = useCallback(
    async (_method: string, args: PaymentArgs): Promise<ConfirmOrderResult> => {
      if (!cartRef) return { message: 'Your cart is not ready yet.' }
      setPaymentsLoading(true)
      try {
        const res = await fetch(`${API_ROUTE}/payments/stripe/confirm-order`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cartID: cartRef.id, secret: cartRef.secret, ...args.additionalData }),
        })
        const result = (await res.json()) as ConfirmOrderResult
        if (res.ok) {
          // The cart is now purchased server-side - drop the local
          // reference so the next visit to the shop starts a fresh one.
          writeStoredCart(null)
          setCartRef(null)
          setCart(null)
        }
        return result
      } finally {
        setPaymentsLoading(false)
      }
    },
    [cartRef],
  )

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      cartLoading,
      addItem,
      incrementItem,
      decrementItem,
      removeItem,
      addresses,
      addressesLoading,
      paymentsLoading,
      initiatePayment,
      confirmOrder,
    }),
    [cart, cartLoading, addItem, incrementItem, decrementItem, removeItem, addresses, addressesLoading, paymentsLoading, initiatePayment, confirmOrder],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

function useCartContext(hookName: string): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error(`${hookName}() must be used within an <EcommerceProvider>`)
  return ctx
}

export function useCart(): { cart: CartDoc | null; isLoading: boolean; addItem: CartContextValue['addItem']; incrementItem: CartContextValue['incrementItem']; decrementItem: CartContextValue['decrementItem']; removeItem: CartContextValue['removeItem'] } {
  const ctx = useCartContext('useCart')
  return {
    cart: ctx.cart,
    isLoading: ctx.cartLoading,
    addItem: ctx.addItem,
    incrementItem: ctx.incrementItem,
    decrementItem: ctx.decrementItem,
    removeItem: ctx.removeItem,
  }
}

export function useAddresses(): { addresses: AddressDoc[]; isLoading: boolean } {
  const ctx = useCartContext('useAddresses')
  return { addresses: ctx.addresses, isLoading: ctx.addressesLoading }
}

export function usePayments(): { initiatePayment: CartContextValue['initiatePayment']; confirmOrder: CartContextValue['confirmOrder']; isLoading: boolean } {
  const ctx = useCartContext('usePayments')
  return {
    initiatePayment: ctx.initiatePayment,
    confirmOrder: ctx.confirmOrder,
    isLoading: ctx.paymentsLoading,
  }
}
