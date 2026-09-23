import type { BlocksField, Field, SelectField, TextField } from '@/engine'

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

const cartItemFields = [
  { name: 'product', type: 'relationship', relationTo: 'products' },
  { name: 'quantity', type: 'number', required: true },
]

const transactionItemFields = [
  { name: 'product', type: 'relationship', relationTo: 'products' },
  { name: 'quantity', type: 'number', required: true },
]

const orderItemFields = [
  { name: 'product', type: 'relationship', relationTo: 'products' },
  { name: 'quantity', type: 'number', required: true },
]

export const currencyField: SelectField = {
  name: 'currency',
  type: 'select',
  defaultValue: 'AUD',
  options: [
    { label: 'AUD', value: 'AUD' },
    { label: 'USD', value: 'USD' },
    { label: 'EUR', value: 'EUR' },
  ],
}

export function cartItemsField(name: string): BlocksField {
  return {
    name,
    type: 'array',
    fields: cartItemFields,
  }
}

export function transactionItemsField(name: string): BlocksField {
  return {
    name,
    type: 'array',
    fields: transactionItemFields,
  }
}

export function orderItemsField(name: string): BlocksField {
  return {
    name,
    type: 'array',
    fields: orderItemFields,
  }
}
