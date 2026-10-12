import type { CarrierDef } from './types'

/**
 * The carriers offered in Shop settings > Shipping, in pick-list order. `fields` are the credential
 * keys each carrier needs; the shipping-settings global (src/globals/ShippingSettings.ts) has one
 * group per carrier with exactly these keys, and the secret ones are encrypted at rest.
 */
export const CARRIERS: CarrierDef[] = [
  {
    id: 'auspost',
    label: 'Australia Post',
    summary: 'Parcel Post and Express Post. Rates use the free Postage Assessment Calculator (PAC); labels need a Shipping and Mailing account.',
    signupUrl: 'https://auspost.com.au/business/shipping/send-parcels-and-letters/shipping-and-mailing',
    docsUrl: 'https://developers.auspost.com.au/',
    keysHelp: 'Register at developers.auspost.com.au for a PAC API key (rates). For labels, your Shipping and Mailing account number, API key and API password are in the ShipPing / MyPost Business developer area.',
    fields: [
      { key: 'pacKey', label: 'PAC API key', secret: true, help: 'Used for live postage rates. Free from the Australia Post developer centre.' },
      { key: 'accountNumber', label: 'Account number', help: 'Your Shipping and Mailing (ShipPing) account number. Needed to buy labels.' },
      { key: 'apiKey', label: 'ShipPing API key', secret: true, help: 'Needed to buy labels.' },
      { key: 'apiPassword', label: 'ShipPing API password', secret: true, help: 'Needed to buy labels.' },
    ],
    live: { rates: true, labels: false },
  },
  {
    id: 'sendle',
    label: 'Sendle',
    summary: 'Carbon-neutral door-to-door parcels in Australia, with pickup from your door.',
    signupUrl: 'https://www.sendle.com/',
    docsUrl: 'https://developers.sendle.com/',
    keysHelp: 'In your Sendle dashboard open Settings > Integrations > API to find your Sendle ID and API key. Test mode uses sandbox.sendle.com, which needs its own sandbox account.',
    fields: [
      { key: 'sendleId', label: 'Sendle ID', help: 'Shown next to your API key in the Sendle dashboard.' },
      { key: 'apiKey', label: 'API key', secret: true, help: 'Treat it like a password.' },
    ],
    live: { rates: true, labels: true },
  },
  {
    id: 'startrack',
    label: 'StarTrack',
    summary: 'Express and premium freight from the Australia Post group, for heavier or time-critical parcels.',
    signupUrl: 'https://startrack.com.au/',
    docsUrl: 'https://developers.auspost.com.au/',
    keysHelp: 'StarTrack uses the same Shipping and Mailing API as Australia Post. Ask your StarTrack account manager to enable API access, then copy the account number and API credentials.',
    fields: [
      { key: 'accountNumber', label: 'Account number', help: 'Your StarTrack account number.' },
      { key: 'apiKey', label: 'API key', secret: true, help: 'From your StarTrack API access email.' },
      { key: 'apiPassword', label: 'API password', secret: true, help: 'From your StarTrack API access email.' },
    ],
    live: { rates: false, labels: false },
  },
  {
    id: 'couriersplease',
    label: 'Couriers Please',
    summary: 'Australian road and air courier with e-commerce rates.',
    signupUrl: 'https://www.couriersplease.com.au/',
    docsUrl: 'https://api.couriersplease.com.au/',
    keysHelp: 'Ask Couriers Please for API access on your account. They email an account number and API key for production and a separate set for testing.',
    fields: [
      { key: 'accountNumber', label: 'Account number', help: 'Your Couriers Please account number.' },
      { key: 'apiKey', label: 'API key', secret: true, help: 'The production or test key, matching the test mode switch.' },
    ],
    live: { rates: false, labels: false },
  },
  {
    id: 'dhl',
    label: 'DHL Express',
    summary: 'International express shipping.',
    signupUrl: 'https://www.dhl.com/au-en/home/express/open-an-account.html',
    docsUrl: 'https://developer.dhl.com/',
    keysHelp: 'Create an app at developer.dhl.com to get an API key and secret, and use your DHL Express account number.',
    fields: [
      { key: 'apiKey', label: 'API key', secret: true, help: 'From your app at developer.dhl.com.' },
      { key: 'apiSecret', label: 'API secret', secret: true, help: 'From the same app.' },
      { key: 'accountNumber', label: 'DHL account number', help: 'Your DHL Express account number.' },
    ],
    live: { rates: false, labels: false },
  },
  {
    id: 'ups',
    label: 'UPS',
    summary: 'International and domestic parcels.',
    signupUrl: 'https://www.ups.com/au/en/business-solutions/create-account.page',
    docsUrl: 'https://developer.ups.com/',
    keysHelp: 'Create an app at developer.ups.com to get a client ID and client secret, and link your UPS account number to it.',
    fields: [
      { key: 'clientId', label: 'Client ID', help: 'From your app at developer.ups.com.' },
      { key: 'clientSecret', label: 'Client secret', secret: true, help: 'From the same app.' },
      { key: 'accountNumber', label: 'UPS account number', help: 'Your six-character UPS account number.' },
    ],
    live: { rates: false, labels: false },
  },
  {
    id: 'fedex',
    label: 'FedEx',
    summary: 'International and domestic parcels.',
    signupUrl: 'https://www.fedex.com/en-au/create-account.html',
    docsUrl: 'https://developer.fedex.com/',
    keysHelp: 'Create a project at developer.fedex.com to get an API key and secret key, and use your FedEx account number.',
    fields: [
      { key: 'apiKey', label: 'API key', secret: true, help: 'From your project at developer.fedex.com.' },
      { key: 'secretKey', label: 'Secret key', secret: true, help: 'From the same project.' },
      { key: 'accountNumber', label: 'FedEx account number', help: 'Your nine-digit FedEx account number.' },
    ],
    live: { rates: false, labels: false },
  },
  {
    id: 'shipstation',
    label: 'ShipStation',
    summary: 'A shipping hub: one account that buys labels from many carriers.',
    signupUrl: 'https://www.shipstation.com/',
    docsUrl: 'https://www.shipstation.com/docs/api/',
    keysHelp: 'In ShipStation open Account Settings > API Settings and generate an API key and secret.',
    fields: [
      { key: 'apiKey', label: 'API key', secret: true, help: 'From ShipStation Account Settings > API Settings.' },
      { key: 'apiSecret', label: 'API secret', secret: true, help: 'Shown once when the key is generated.' },
    ],
    live: { rates: false, labels: false },
  },
  {
    id: 'shippit',
    label: 'Shippit',
    summary: 'An Australian shipping hub that compares many couriers.',
    signupUrl: 'https://www.shippit.com/',
    docsUrl: 'https://developer.shippit.com/',
    keysHelp: 'In the Shippit dashboard open Settings > Integrations > API to copy your API key. Staging uses a separate key.',
    fields: [{ key: 'apiKey', label: 'API key', secret: true, help: 'From Shippit Settings > Integrations.' }],
    live: { rates: false, labels: false },
  },
]

export const CARRIER_IDS = CARRIERS.map((c) => c.id)

export const carrierDef = (id: string): CarrierDef | undefined => CARRIERS.find((c) => c.id === id)

/** True when every field that is not optional has a value. Account number style fields are optional unless listed. */
export function missingCredentialKeys(def: CarrierDef, values: Record<string, string>, required?: string[]): string[] {
  const need = required ?? def.fields.map((f) => f.key)
  return need.filter((k) => !(values[k] ?? '').trim())
}
