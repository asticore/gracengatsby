'use client'

import React, { useSyncExternalStore } from 'react'

const subscribe = () => () => {}
const readOrigin = () => window.location.origin
const readServerOrigin = () => ''

/** Shown under the Payments form: the address to paste into PayPal, and where to find the webhook id. */
export const PayPalWebhookHelp: React.FC = () => {
  const origin = useSyncExternalStore(subscribe, readOrigin, readServerOrigin)
  const address = `${origin}/api/shop-paypal-webhook`
  return (
    <div className="shop-test-panel">
      <h3>PayPal webhook</h3>
      <p>
        A webhook lets PayPal tell the shop when a payment is finished, declined or refunded, even if the customer closes the page too early. Without it, a payment
        that PayPal finishes later is never marked paid here.
      </p>
      <ol>
        <li>In your PayPal developer dashboard, open your app and choose Webhooks, then Add webhook.</li>
        <li>
          Paste this address as the webhook URL: <code>{address}</code>
        </li>
        <li>Tick the events Payment capture completed, Payment capture denied, Payment capture declined and Payment capture refunded.</li>
        <li>PayPal then shows a Webhook ID. Paste it into the Webhook ID box in the PayPal section above, then save.</li>
      </ol>
      <p>Use the sandbox dashboard with sandbox keys, and the live dashboard with live keys. Each environment has its own webhook and ID.</p>
    </div>
  )
}
