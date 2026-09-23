import type { Field } from '@/engine'

const addressFields: Field[] = [
  { name: 'title', type: 'text' },
  { name: 'firstName', type: 'text' },
  { name: 'lastName', type: 'text' },
  { name: 'company', type: 'text' },
  { name: 'addressLine1', type: 'text' },
  { name: 'addressLine2', type: 'text' },
  { name: 'city', type: 'text' },
  { name: 'state', type: 'text' },
  { name: 'postalCode', type: 'text' },
  { name: 'country', type: 'text' },
  { name: 'phone', type: 'text' },
]

const cartItemFields: Field[] = [
  { name: 'product', type: 'relationship', relationTo: 'products' },
  { name: 'quantity', type: 'number', required: true },
]

const transactionItemFields: Field[] = [
  { name: 'product', type: 'relationship', relationTo: 'products' },
  { name: 'quantity', type: 'number', required: true },
]

const orderItemFields: Field[] = [
  { name: 'product', type: 'relationship', relationTo: 'products' },
  { name: 'quantity', type: 'number', required: true },
]

export const currencyField: Field = {
  name: 'currency',
  type: 'select',
  defaultValue: 'AUD',
  options: [
    { label: 'AUD', value: 'AUD' },
    { label: 'USD', value: 'USD' },
    { label: 'EUR', value: 'EUR' },
  ],
}

export function cartItemsField(name: string): Field {
  return {
    name,
    type: 'array',
    fields: cartItemFields,
  }
}

export function transactionItemsField(name: string): Field {
  return {
    name,
    type: 'array',
    fields: transactionItemFields,
  }
}

export function orderItemsField(name: string): Field {
  return {
    name,
    type: 'array',
    fields: orderItemFields,
  }
}
