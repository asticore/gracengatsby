import fs from 'fs'
import path from 'path'
import { sqliteD1Adapter } from '@payloadcms/db-d1-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import { CloudflareContext, getCloudflareContext } from '@opennextjs/cloudflare'
import { GetPlatformProxyOptions } from 'wrangler'
import { r2Storage } from '@payloadcms/storage-r2'
import { ecommercePlugin } from '@payloadcms/plugin-ecommerce'
import { stripeAdapter } from '@payloadcms/plugin-ecommerce/payments/stripe'
//import { payloadTotp } from 'payload-totp'
import {
  isAdmin,
  adminOnlyFieldAccess,
  isAuthenticated,
  isCustomer,
  adminOrPublishedStatus,
  isDocumentOwner,
} from './access/ecommerceAccess'
import { AUD } from './lib/currencies'
import { formatSlugHook } from './utilities/formatSlug'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Events } from './collections/Events'
import { EventRSVPs } from './collections/EventRSVPs'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const realpath = (value: string) => (fs.existsSync(value) ? fs.realpathSync(value) : undefined)

const isCLI = process.argv.some((value) => realpath(value).endsWith(path.join('payload', 'bin.js')))
const isProduction = process.env.NODE_ENV === 'production'

const createLog =
  (level: string, fn: typeof console.log) => (objOrMsg: object | string, msg?: string) => {
    if (typeof objOrMsg === 'string') {
      fn(JSON.stringify({ level, msg: objOrMsg }))
    } else {
      fn(JSON.stringify({ level, ...objOrMsg, msg: msg ?? (objOrMsg as { msg?: string }).msg }))
    }
  }

const cloudflareLogger = {
  level: process.env.PAYLOAD_LOG_LEVEL || 'info',
  trace: createLog('trace', console.debug),
  debug: createLog('debug', console.debug),
  info: createLog('info', console.log),
  warn: createLog('warn', console.warn),
  error: createLog('error', console.error),
  fatal: createLog('fatal', console.error),
  silent: () => {},
} as any // Use PayloadLogger type when it's exported

const cloudflare =
  isCLI || !isProduction
    ? await getCloudflareContextFromWrangler()
    : await getCloudflareContext({ async: true })

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media, Events, EventRSVPs],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: sqliteD1Adapter({ binding: cloudflare.env.D1 }),
  logger: isProduction ? cloudflareLogger : undefined,
  plugins: [
    r2Storage({
      bucket: cloudflare.env.R2,
      collections: { media: true },
    }),
    ecommercePlugin({
      customers: { slug: 'users' },
      currencies: {
        defaultCurrency: 'AUD',
        supportedCurrencies: [AUD],
      },
      products: {
        // Keep the storefront simple for now - variants (size/colour) can be
        // switched on later without losing any existing product data.
        variants: false,
        productsCollectionOverride: ({ defaultCollection }) => ({
          ...defaultCollection,
          admin: {
            ...defaultCollection.admin,
            useAsTitle: 'title',
            defaultColumns: ['title', 'category', 'priceInAUD', 'inventory', '_status'],
          },
          fields: [
            {
              name: 'title',
              type: 'text',
              required: true,
            },
            {
              name: 'slug',
              type: 'text',
              required: true,
              unique: true,
              admin: {
                position: 'sidebar',
                description: 'Auto-generated from the title if left blank.',
              },
              hooks: {
                beforeValidate: [formatSlugHook('title')],
              },
            },
            {
              name: 'category',
              type: 'select',
              options: [
                { label: 'Apparel', value: 'apparel' },
                { label: 'Accessories', value: 'accessories' },
                { label: 'Jewellery', value: 'jewellery' },
                { label: 'Homeware', value: 'homeware' },
                { label: 'Gifting', value: 'gifting' },
              ],
              admin: { position: 'sidebar' },
            },
            {
              name: 'shortDescription',
              type: 'textarea',
              admin: {
                description: 'Shown on product listing cards.',
              },
            },
            {
              name: 'description',
              type: 'richText',
              editor: lexicalEditor(),
            },
            {
              name: 'images',
              type: 'upload',
              relationTo: 'media',
              hasMany: true,
            },
            ...defaultCollection.fields,
          ],
        }),
      },
      carts: {
        allowGuestCarts: true,
      },
      orders: true,
      transactions: true,
      addresses: true,
      access: {
        isAdmin,
        adminOnlyFieldAccess,
        isAuthenticated,
        isCustomer,
        adminOrPublishedStatus,
        isDocumentOwner,
      },
      payments: {
        paymentMethods: [
          stripeAdapter({
            publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
            secretKey: process.env.STRIPE_SECRET_KEY || '',
            webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
          }),
        ],
      },
    }),
    //payloadTotp({
    //  collection: 'users',
    //}),
  ],
})

// Adapted from https://github.com/opennextjs/opennextjs-cloudflare/blob/d00b3a13e42e65aad76fba41774815726422cc39/packages/cloudflare/src/api/cloudflare-context.ts#L328C36-L328C46
function getCloudflareContextFromWrangler(): Promise<CloudflareContext> {
  return import(/* webpackIgnore: true */ `${'__wrangler'.replaceAll('_', '')}`).then(
    ({ getPlatformProxy }) =>
      getPlatformProxy({
        environment: process.env.CLOUDFLARE_ENV,
        remoteBindings: isProduction,
      } satisfies GetPlatformProxyOptions),
  )
}
